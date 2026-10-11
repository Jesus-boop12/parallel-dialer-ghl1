'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

const { JobStore } = require('./lib/store');
const presets = require('./lib/presets');
const { createMockProvider } = require('./lib/provider-mock');
const { createHiggsfieldProvider } = require('./lib/provider-higgsfield');

const PORT = Number(process.env.PORT) || 4000;
const BASE_URL = (process.env.BASE_URL || '').replace(/\/+$/, '');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const OUTPUTS_DIR = path.join(DATA_DIR, 'outputs');
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_JOBS = 500;

for (const dir of [UPLOADS_DIR, OUTPUTS_DIR]) fs.mkdirSync(dir, { recursive: true });

const store = new JobStore(path.join(DATA_DIR, 'jobs.json'));

const liveMode = Boolean(process.env.HIGGSFIELD_API_KEY && process.env.HIGGSFIELD_API_SECRET);
const provider = liveMode
  ? createHiggsfieldProvider({
      apiKey: process.env.HIGGSFIELD_API_KEY,
      apiSecret: process.env.HIGGSFIELD_API_SECRET,
      apiBase: process.env.HIGGSFIELD_API_BASE,
    })
  : createMockProvider({ outputsDir: OUTPUTS_DIR });

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '20mb' }));

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '1d' }));
app.use('/outputs', express.static(OUTPUTS_DIR, { maxAge: '1d' }));

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function publicUrl(req, relativeUrl) {
  if (/^(https?:|data:)/i.test(relativeUrl)) return relativeUrl;
  const origin = BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${origin}${relativeUrl}`;
}

function clean(job) {
  return job;
}

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

// ---------- config ----------

app.get('/api/config', (req, res) => {
  res.json({
    mode: provider.name,
    motions: presets.MOTIONS,
    styles: presets.STYLES,
    aspectRatios: presets.ASPECT_RATIOS,
    videoModels: presets.VIDEO_MODELS,
    durations: presets.DURATIONS,
  });
});

// ---------- uploads ----------

const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

app.post('/api/upload', (req, res) => {
  const { dataUrl, name } = req.body || {};
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl || '');
  if (!match) return sendError(res, 400, 'Expected a PNG, JPEG, WebP or GIF data URL');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) return sendError(res, 400, 'Empty image');
  if (buffer.length > MAX_UPLOAD_BYTES) return sendError(res, 413, 'Image larger than 12 MB');
  const id = newId();
  const file = `${id}.${MIME_EXT[match[1]]}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, file), buffer);
  res.status(201).json({ id, url: `/uploads/${file}`, name: String(name || file).slice(0, 120), bytes: buffer.length });
});

// ---------- generation ----------

function trimJobs() {
  const all = store.all();
  for (const job of all.slice(MAX_JOBS)) store.remove(job.id);
}

app.post('/api/generate/image', async (req, res) => {
  const body = req.body || {};
  const prompt = String(body.prompt || '').trim();
  if (!prompt) return sendError(res, 400, 'Prompt is required');
  if (prompt.length > 2000) return sendError(res, 400, 'Prompt is too long');
  const aspect = presets.findAspect(body.aspectRatio);
  const style = presets.findStyle(body.style);
  const count = Math.min(4, Math.max(1, Number(body.count) || 1));
  const fullPrompt = style.suffix ? `${prompt}, ${style.suffix}` : prompt;

  const job = {
    id: newId(),
    kind: 'image',
    status: 'queued',
    progress: 0,
    prompt,
    fullPrompt,
    style: style.id,
    aspectRatio: aspect.id,
    count,
    outputs: [],
    error: null,
    providerId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  try {
    const result = await provider.submitImage({ id: job.id, prompt: fullPrompt, aspect, count });
    job.providerId = result.providerId;
    job.status = result.status || 'queued';
  } catch (err) {
    console.error('[image] submit failed:', err.message);
    return sendError(res, 502, err.message);
  }
  store.put(job);
  trimJobs();
  res.status(201).json(clean(job));
});

app.post('/api/generate/video', async (req, res) => {
  const body = req.body || {};
  const motion = presets.findMotion(body.motionId);
  if (!motion) return sendError(res, 400, 'Unknown motion preset');
  const imageUrl = String(body.imageUrl || '').trim();
  if (!/^(\/uploads\/|\/outputs\/|https?:\/\/)/.test(imageUrl)) return sendError(res, 400, 'A reference image is required');
  if (/^\/(uploads|outputs)\//.test(imageUrl) && !fs.existsSync(path.join(DATA_DIR, imageUrl.slice(1)))) {
    return sendError(res, 404, 'Reference image not found');
  }
  const model = presets.VIDEO_MODELS.some((m) => m.id === body.model) ? body.model : presets.VIDEO_MODELS[1].id;
  const duration = presets.DURATIONS.includes(Number(body.duration)) ? Number(body.duration) : presets.DURATIONS[1];
  const prompt = String(body.prompt || '').trim().slice(0, 2000);

  const job = {
    id: newId(),
    kind: 'video',
    status: 'queued',
    progress: 0,
    prompt,
    motionId: motion.id,
    motionName: motion.name,
    model,
    duration,
    sourceImageUrl: imageUrl,
    outputs: [],
    error: null,
    providerId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  try {
    const result = await provider.submitVideo({
      id: job.id,
      prompt,
      imageUrl: publicUrl(req, imageUrl),
      motion,
      model,
      duration,
    });
    job.providerId = result.providerId;
    job.status = result.status || 'queued';
    if (result.motionResolved === false) job.note = `Motion "${motion.name}" was not found in the provider catalog; sent as a prompt only.`;
  } catch (err) {
    console.error('[video] submit failed:', err.message);
    return sendError(res, 502, err.message);
  }
  store.put(job);
  trimJobs();
  res.status(201).json(clean(job));
});

// ---------- jobs ----------

const PENDING = new Set(['queued', 'in_progress']);
const refreshing = new Map();

async function refreshJob(job) {
  if (!PENDING.has(job.status)) return job;
  if (refreshing.has(job.id)) return refreshing.get(job.id);
  const task = (async () => {
    try {
      const result = await provider.getStatus(job);
      const changes = { status: result.status };
      if (typeof result.progress === 'number') changes.progress = result.progress;
      if (result.status === 'completed') {
        changes.progress = 1;
        changes.outputs = result.outputs || [];
        if (!changes.outputs.length) {
          changes.status = 'failed';
          changes.error = 'Provider completed without any output';
        }
      }
      if (result.error) changes.error = String(result.error);
      return store.patch(job.id, changes);
    } catch (err) {
      console.warn(`[jobs] refresh ${job.id} failed:`, err.message);
      job.lastRefreshError = err.message;
      if (Date.now() - job.createdAt > 30 * 60 * 1000) {
        return store.patch(job.id, { status: 'failed', error: `Timed out: ${err.message}` });
      }
      return job;
    } finally {
      refreshing.delete(job.id);
    }
  })();
  refreshing.set(job.id, task);
  return task;
}

app.get('/api/jobs', async (req, res) => {
  const jobs = store.all();
  const pending = jobs.filter((j) => PENDING.has(j.status)).slice(0, 12);
  await Promise.all(pending.map(refreshJob));
  res.json(store.all().map(clean));
});

app.get('/api/jobs/:id', async (req, res) => {
  const job = store.get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  await refreshJob(job);
  res.json(clean(store.get(job.id)));
});

app.delete('/api/jobs/:id', (req, res) => {
  const job = store.get(req.params.id);
  if (!job) return sendError(res, 404, 'Job not found');
  for (const out of job.outputs || []) {
    if (out.url && out.url.startsWith('/outputs/')) {
      fs.rm(path.join(OUTPUTS_DIR, path.basename(out.url)), { force: true }, () => {});
    }
  }
  store.remove(job.id);
  res.status(204).end();
});

app.get('/api/health', (req, res) => res.json({ ok: true, mode: provider.name }));

app.use('/api', (req, res) => sendError(res, 404, 'Not found'));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return sendError(res, 413, 'Request body too large');
  if (err.type === 'entity.parse.failed') return sendError(res, 400, 'Invalid JSON');
  console.error(err);
  sendError(res, 500, 'Internal error');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Orbit Studio running on http://localhost:${PORT} (${provider.name} mode)`);
    if (!liveMode) console.log('No HIGGSFIELD_API_KEY / HIGGSFIELD_API_SECRET set: using mock renders.');
  });
}

module.exports = { app, store, provider };
