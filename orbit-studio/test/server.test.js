'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-test-'));
delete process.env.HIGGSFIELD_API_KEY;
delete process.env.HIGGSFIELD_API_SECRET;

const { app } = require('../server');

let server;
let base;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

async function json(method, pathname, body) {
  const res = await fetch(base + pathname, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

async function waitFor(id, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await json('GET', `/api/jobs/${id}`);
    if (data.status !== 'queued' && data.status !== 'in_progress') return data;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`job ${id} did not finish`);
}

test('config exposes presets in mock mode', async () => {
  const { status, data } = await json('GET', '/api/config');
  assert.equal(status, 200);
  assert.equal(data.mode, 'mock');
  assert.ok(data.motions.length > 10);
  assert.ok(data.styles.some((s) => s.id === 'cinematic'));
});

test('rejects an empty image prompt', async () => {
  const { status, data } = await json('POST', '/api/generate/image', { prompt: '   ' });
  assert.equal(status, 400);
  assert.match(data.error, /prompt/i);
});

test('generates images and completes them', async () => {
  const { status, data: job } = await json('POST', '/api/generate/image', { prompt: 'a red bicycle at dawn', aspectRatio: '16:9', style: 'noir', count: 2 });
  assert.equal(status, 201);
  assert.equal(job.kind, 'image');
  assert.match(job.fullPrompt, /film noir/);
  const done = await waitFor(job.id);
  assert.equal(done.status, 'completed');
  assert.equal(done.outputs.length, 2);
  const img = await fetch(base + done.outputs[0].url);
  assert.equal(img.status, 200);
  assert.match(img.headers.get('content-type'), /svg/);
});

test('uploads a reference image and animates it', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const up = await json('POST', '/api/upload', { dataUrl: png, name: 'dot.png' });
  assert.equal(up.status, 201);
  assert.match(up.data.url, /^\/uploads\//);

  const bad = await json('POST', '/api/generate/video', { imageUrl: up.data.url, motionId: 'nope' });
  assert.equal(bad.status, 400);

  const { status, data: job } = await json('POST', '/api/generate/video', { imageUrl: up.data.url, motionId: 'crash_zoom', duration: 3, model: 'dop-turbo' });
  assert.equal(status, 201);
  assert.equal(job.motionName, 'Crash Zoom');
  const done = await waitFor(job.id);
  assert.equal(done.status, 'completed');
  assert.equal(done.outputs[0].type, 'motion-preview');
  assert.equal(done.outputs[0].motionId, 'crash_zoom');
});

test('rejects a video with a missing reference image', async () => {
  const { status } = await json('POST', '/api/generate/video', { imageUrl: '/uploads/missing.png', motionId: 'dolly_in' });
  assert.equal(status, 404);
});

test('lists and deletes jobs', async () => {
  const list = await json('GET', '/api/jobs');
  assert.equal(list.status, 200);
  assert.ok(list.data.length >= 2);
  const target = list.data[0];
  const del = await fetch(`${base}/api/jobs/${target.id}`, { method: 'DELETE' });
  assert.equal(del.status, 204);
  const after = await json('GET', `/api/jobs/${target.id}`);
  assert.equal(after.status, 404);
});
