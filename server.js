const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || 'changeme';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;
const GHL_API_KEY = process.env.GHL_API_KEY;

function requireAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== APP_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

async function addGhlNote(contactId, note) {
  if (!contactId || !GHL_API_KEY) return;
  try {
    await fetch(`https://rest.gohighlevel.com/v1/contacts/${contactId}/notes/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GHL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: note }),
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

      <label>Password</label>
      <input id="password" type="password" placeholder="App password" />

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
        const password = document.getElementById('password').value;
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
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + password
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


app.post('/api/dial', requireAuth, async (req, res) => {
  const { numbers, leadName, contactId, whisper } = req.body;

  if (!Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({ error: 'numbers array is required' });
  }
  if (numbers.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 numbers allowed' });
  }

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    return res.status(500).json({ error: 'Twilio credentials not configured' });
  }

  const twilio = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

  const whisperText = whisper || (leadName ? `Connecting you with ${leadName}` : 'Connecting your call');

  const results = await Promise.allSettled(
    numbers.map((to) =>
      twilio.calls.create({
        to,
        from: TWILIO_FROM_NUMBER,
        twiml: `<Response><Say>${whisperText}</Say><Pause length="60"/></Response>`,
      })
    )
  );

  const calls = results.map((r, i) => ({
    number: numbers[i],
    status: r.status === 'fulfilled' ? r.value.status : 'failed',
    sid: r.status === 'fulfilled' ? r.value.sid : null,
    error: r.status === 'rejected' ? r.reason.message : null,
  }));

  if (contactId) {
    const summary = calls
      .map((c) => `${c.number}: ${c.status}${c.error ? ` (${c.error})` : ''}`)
      .join('\n');
    await addGhlNote(contactId, `Parallel dial initiated for ${leadName || 'lead'}:\n${summary}`);
  }

  res.json({ calls });
});

app.listen(PORT, () => {
  console.log(`Parallel dialer listening on port ${PORT}`);
});
