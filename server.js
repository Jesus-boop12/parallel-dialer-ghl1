const express = require('express');
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
});
