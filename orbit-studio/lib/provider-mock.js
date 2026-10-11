'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Mock provider: completes jobs after a short delay without any external API.
// Images are rendered as SVG posters derived from the prompt; videos are
// returned as "motion previews" (the reference image plus a motion id) that
// the frontend animates with CSS.

function hash(str) {
  return crypto.createHash('sha1').update(String(str)).digest();
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function wrapWords(text, maxChars, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars) {
      lines.push(line.trim());
      line = w;
      if (lines.length === maxLines) break;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (words.join(' ').length > lines.join(' ').length) lines[lines.length - 1] += '…';
  return lines;
}

function renderPoster({ prompt, width, height, seed }) {
  const h = hash(`${prompt}|${seed}`);
  const hue1 = h[0] * 360 / 255;
  const hue2 = (hue1 + 60 + h[1] * 120 / 255) % 360;
  const hue3 = (hue1 + 200) % 360;
  const blobs = [];
  for (let i = 0; i < 6; i++) {
    const cx = (h[2 + i] / 255) * width;
    const cy = (h[8 + i] / 255) * height;
    const r = (0.18 + (h[14 + i % 6] / 255) * 0.35) * Math.max(width, height);
    const hue = [hue1, hue2, hue3][i % 3];
    blobs.push(`<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="hsl(${hue.toFixed(0)} 80% ${(45 + i * 5)}%)" opacity="0.55" filter="url(#blur)"/>`);
  }
  const fontSize = Math.round(Math.min(width, height) / 18);
  const lines = wrapWords(prompt, Math.floor(width / (fontSize * 0.55)), 3);
  const text = lines.map((l, i) => `<tspan x="${Math.round(width * 0.06)}" dy="${i === 0 ? 0 : fontSize * 1.25}">${escapeXml(l)}</tspan>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue1.toFixed(0)} 60% 12%)"/>
      <stop offset="1" stop-color="hsl(${hue3.toFixed(0)} 55% 8%)"/>
    </linearGradient>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${Math.round(Math.max(width, height) / 12)}"/></filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.08"/></feComponentTransfer></filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  ${blobs.join('\n  ')}
  <rect width="100%" height="100%" filter="url(#grain)"/>
  <rect x="0" y="${Math.round(height * 0.72)}" width="100%" height="${Math.round(height * 0.28)}" fill="rgba(0,0,0,0.45)"/>
  <text x="${Math.round(width * 0.06)}" y="${Math.round(height * 0.72 + fontSize * 1.6)}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#fff">${text}</text>
  <text x="${Math.round(width * 0.06)}" y="${height - Math.round(fontSize * 0.9)}" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(fontSize * 0.55)}" fill="rgba(255,255,255,0.6)" letter-spacing="2">MOCK RENDER · ORBIT STUDIO</text>
</svg>`;
}

function createMockProvider({ outputsDir, delayMs = { image: 2500, video: 4500 } }) {
  const pending = new Map();

  return {
    name: 'mock',

    async listMotions() {
      return [];
    },

    async submitImage({ id, prompt, aspect, count }) {
      const width = 768;
      const height = Math.round((width * aspect.h) / aspect.w);
      const outputs = [];
      for (let i = 0; i < count; i++) {
        const file = `${id}-${i}.svg`;
        fs.writeFileSync(path.join(outputsDir, file), renderPoster({ prompt, width, height, seed: i }));
        outputs.push({ type: 'image', url: `/outputs/${file}`, width, height });
      }
      pending.set(id, { readyAt: Date.now() + delayMs.image + Math.random() * 1500, outputs });
      return { providerId: `mock-${id}`, status: 'queued' };
    },

    async submitVideo({ id, imageUrl, motion, duration, prompt }) {
      const outputs = [{ type: 'motion-preview', imageUrl, motionId: motion.id, duration, prompt }];
      pending.set(id, { readyAt: Date.now() + delayMs.video + Math.random() * 2500, outputs });
      return { providerId: `mock-${id}`, status: 'queued' };
    },

    async getStatus(job) {
      const entry = pending.get(job.id);
      if (!entry) {
        // Process restarted while the job was pending: fail it so the UI is not stuck.
        return { status: 'failed', error: 'Mock job lost on restart' };
      }
      const elapsed = Date.now() - job.createdAt;
      const total = entry.readyAt - job.createdAt;
      if (Date.now() < entry.readyAt) {
        return { status: elapsed < total * 0.3 ? 'queued' : 'in_progress', progress: Math.min(0.95, elapsed / total) };
      }
      pending.delete(job.id);
      return { status: 'completed', progress: 1, outputs: entry.outputs };
    },
  };
}

module.exports = { createMockProvider, renderPoster };
