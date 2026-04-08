const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || '';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const FROM = process.env.TWILIO_PHONE_NUMBER;
const GHL_API_KEY =
  process.env.GHL_API_KEY || process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;

const activeSessions = new Map();

function normalizePhone(phone) {
  if (!phone) return '';

  const raw = String(phone).trim();
  if (raw.startsWith('+')) return raw;

  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (!digits) return '';

  return `+${digits}`;
}

async function addNoteToHighLevel(contactId, body) {
  if (!contactId || !GHL_API_KEY) return;

  try {
    await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/notes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GHL_API_KEY}`,
        Version: '2021-07-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        body,
        locationId: GHL_LOCATION_ID
      })
    });
  } catch (e) {
    console.error('GHL note error:', e.message);
  }
}

app.get('/', (req, res) => {
  res.type('html').send(`
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Parallel Dialer</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        max-width: 900px;
        margin: 40px auto;
        padding: 0 16px;
      }
      .card {
        border: 1px solid #ddd;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 16px;
      }
      input, textarea, button {
        width: 100%;
        padding: 12px;
        margin-top: 8px;
        box-sizing: border-box;
      }
      textarea {
        min-height: 120px;
      }
      button {
        cursor: pointer;
      }
      .row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      pre {
        background: #f7f7f7;
        padding: 12px;
        border-radius: 12px;
        overflow: auto;
      }
      @media (max-width: 700px) {
        .row {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <h1>Parallel Dialer</h1>

    <div class="card">
      <p>Paste up to 10 phone numbers, one per line. First answered call wins.</p>

      <div class="row">
        <div>
          <label>Lead name</label>
          <input id="leadName" placeholder="John Smith" />
        </div>
        <div>
          <label>GoHighLevel Contact ID</label>
          <input id="contactId" placeholder="optional" />
        </div>
      </div>

      <label>Phone numbers</label>
      <textarea id="numbers" placeholder="+16305551212&#10;+17085551212"></textarea>

      <label>Whisper message (optional)</label>
      <input id="whisper" placeholder="New internet lead for final expense" />

      <button onclick="startDial()">Start Parallel Dial</button>
    </div>

    <div class="card">
      <h3>Response</h3>
      <pre id="out">Ready</pre>
    </div>

    <script>
      async function startDial() {
        const leadName = document.getElementById('leadName').value;
        const contactId = document.getElementById('contactId').value;
        const whisper = document.getElementById('whisper').value;
        const numbers = document.getElementById('numbers').value
          .split('\\n')
          .map(v => v.trim())
          .filter(Boolean);

        const res = await fetch('/api/dial', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            numbers,
            leadName,
            contactId,
            whisper
          })
        });

        const data = await res.json();
        document.getElementById('out').textContent = JSON.stringify(data, null, 2);
      }
    </script>
  </body>
</html>
  `);
});

app.post('/api/dial', async (req, res) => {
  try {
    const leadName = req.body.leadName || 'Unknown Lead';
    const contactId = req.body.contactId || '';
    const whisper = req.body.whisper || '';
    const numbers = (req.body.numbers || [])
      .map(normalizePhone)
      .filter(Boolean)
      .slice(0, 10);

    if (!numbers.length) {
      return res.status(400).json({ error: 'At least one phone number is required.' });
    }

    if (!BASE_URL) {
      return res.status(500).json({ error: 'Missing BASE_URL env variable.' });
    }

    const sessionId = 'sess_' + Date.now();

    activeSessions.set(sessionId, {
      leadName,
      contactId,
      numbers,
      completed: false,
      winningCallSid: null,
      createdAt: Date.now()
    });

    const calls = await Promise.all(
      numbers.map(async (to) => {
        const call = await client.calls.create({
          to,
          from: FROM,
          url: `${BASE_URL}/twiml?sessionId=${encodeURIComponent(sessionId)}&to=${encodeURIComponent(to)}&leadName=${encodeURIComponent(leadName)}&whisper=${encodeURIComponent(whisper)}`
        });

        return {
          to,
          callSid: call.sid,
          status: call.status
        };
      })
    );

    await addNoteToHighLevel(
      contactId,
      `Parallel dial started for ${leadName}. Numbers: ${numbers.join(', ')}`
    );

    res.json({ ok: true, sessionId, calls });
  } catch (e) {
    console.error('Dial error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/twiml', (req, res) => {
  const sessionId = req.query.sessionId;
  const to = req.query.to;
  const leadName = req.query.leadName;
  const whisper = req.query.whisper;

  const session = activeSessions.get(sessionId);
  const twiml = new twilio.twiml.VoiceResponse();

  if (!session || session.completed) {
    twiml.say('This call is no longer available. Goodbye.');
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }

  if (whisper) {
    twiml.say(whisper);
    twiml.pause({ length: 1 });
  }

  twiml.say(`Connected lead: ${leadName || 'Unknown Lead'}. Press 1 to claim this call.`);
  twiml.gather({
    numDigits: 1,
    action: `/claim?sessionId=${encodeURIComponent(sessionId)}&to=${encodeURIComponent(to || '')}`,
    method: 'POST',
    timeout: 10
  });

  twiml.say('No input received. Goodbye.');
  twiml.hangup();

  res.type('text/xml').send(twiml.toString());
});

app.post('/claim', async (req, res) => {
  const sessionId = req.query.sessionId;
  const to = req.query.to;
  const digits = req.body.Digits;

  const session = activeSessions.get(sessionId);
  const twiml = new twilio.twiml.VoiceResponse();

  if (!session || session.completed || digits !== '1') {
    twiml.say('Call unavailable. Goodbye.');
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }

  session.completed = true;
  session.winningCallSid = req.body.CallSid;

  await addNoteToHighLevel(
    session.contactId,
    `Parallel dial answered by ${to || 'unknown number'}.`
  );

  twiml.say('You claimed the call.');
  twiml.pause({ length: 1 });
  twiml.say('This starter version stops here. In production, transfer or bridge to your lead flow here.');
  twiml.hangup();

  res.type('text/xml').send(twiml.toString());
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
