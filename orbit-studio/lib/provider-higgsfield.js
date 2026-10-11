'use strict';

// Live adapter for the Higgsfield Cloud API.
//
// Endpoint paths and field names follow the publicly documented request shape
// (platform.higgsfield.ai, `hf-api-key` / `hf-secret` headers, `/v1/text2image/soul`,
// `/v1/image2video/dop`, `/v1/request/{id}`). Override HIGGSFIELD_API_BASE if your
// account is on a different host, and check the adapter against the current docs
// before relying on it in production.

function createHiggsfieldProvider({ apiKey, apiSecret, apiBase, fetchImpl = fetch }) {
  const base = String(apiBase || 'https://platform.higgsfield.ai').replace(/\/+$/, '');
  const headers = {
    'content-type': 'application/json',
    'hf-api-key': apiKey,
    'hf-secret': apiSecret,
  };
  let motionCatalog = null;

  async function request(method, pathname, body) {
    const res = await fetchImpl(`${base}${pathname}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const detail = data.detail || data.message || data.error || text.slice(0, 300);
      const err = new Error(`Higgsfield ${method} ${pathname} failed (${res.status}): ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function normalizeStatus(s) {
    const v = String(s || '').toLowerCase();
    if (['completed', 'succeeded', 'success', 'done'].includes(v)) return 'completed';
    if (['failed', 'error', 'nsfw', 'canceled', 'cancelled'].includes(v)) return v === 'nsfw' ? 'nsfw' : 'failed';
    if (['in_progress', 'processing', 'running'].includes(v)) return 'in_progress';
    return 'queued';
  }

  function extractOutputs(data, type) {
    const results = data.results || data.output || data.outputs || [];
    const list = Array.isArray(results) ? results : [results];
    return list
      .map((r) => {
        const url = r?.raw?.url || r?.url || r?.video?.url || r?.image?.url || (typeof r === 'string' ? r : null);
        if (!url) return null;
        return { type, url, thumbnailUrl: r?.min?.url || r?.thumbnail?.url || null };
      })
      .filter(Boolean);
  }

  return {
    name: 'higgsfield',

    async listMotions() {
      if (motionCatalog) return motionCatalog;
      try {
        const data = await request('GET', '/v1/motions');
        motionCatalog = Array.isArray(data) ? data : data.items || data.motions || [];
      } catch (err) {
        console.warn('[higgsfield] could not load motion catalog:', err.message);
        motionCatalog = [];
      }
      return motionCatalog;
    },

    async resolveMotionId(motion) {
      const catalog = await this.listMotions();
      const wanted = [motion.hfName, motion.name].map((s) => s.toLowerCase());
      const hit = catalog.find((m) => wanted.includes(String(m.name || m.title || '').toLowerCase()));
      return hit ? hit.id : null;
    },

    async submitImage({ prompt, aspect, count, quality = '1080p' }) {
      const data = await request('POST', '/v1/text2image/soul', {
        params: {
          prompt,
          width_and_height: aspect.size,
          enhance_prompt: true,
          quality,
          batch_size: count,
        },
      });
      return { providerId: data.id || data.request_id, status: normalizeStatus(data.status) };
    },

    async submitVideo({ prompt, imageUrl, motion, model, duration, strength = 0.8 }) {
      const motionId = await this.resolveMotionId(motion);
      const params = {
        model,
        prompt: prompt || motion.description,
        input_images: [{ type: 'image_url', image_url: imageUrl }],
        enhance_prompt: true,
        duration,
      };
      if (motionId) params.motions = [{ id: motionId, strength }];
      const data = await request('POST', '/v1/image2video/dop', { params });
      return { providerId: data.id || data.request_id, status: normalizeStatus(data.status), motionResolved: Boolean(motionId) };
    },

    async getStatus(job) {
      const data = await request('GET', `/v1/request/${encodeURIComponent(job.providerId)}`);
      const status = normalizeStatus(data.status);
      const result = { status };
      if (status === 'completed') result.outputs = extractOutputs(data, job.kind);
      if (status === 'failed' || status === 'nsfw') result.error = data.error || data.detail || `Provider reported ${data.status}`;
      return result;
    },
  };
}

module.exports = { createHiggsfieldProvider };
