(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = {
    config: null,
    jobs: [],
    view: 'image',
    aspectRatio: '9:16',
    duration: 5,
    motionId: 'dolly_in',
    motionGroup: 'All',
    libraryFilter: 'all',
    refImage: null, // { url, name }
    pollTimer: null,
    styleSheet: null,
  };

  const SUGGESTIONS = [
    'A lone astronaut on a neon rooftop at dusk, rain, reflections',
    'Macro shot of a glass perfume bottle on black marble, caustic light',
    'Street portrait, Tokyo at night, umbrella, film grain',
    'Vintage convertible on a desert highway, golden hour, dust',
    'Editorial fashion shot, red silk dress, studio strobe, wind',
    'Cozy cabin interior, snowfall outside, warm lamp light',
  ];

  // ---------- helpers ----------

  function toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: { 'content-type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function aspectCss(id) {
    const a = state.config.aspectRatios.find((x) => x.id === id);
    return a ? `${a.w} / ${a.h}` : '4 / 5';
  }

  function motionById(id) {
    return state.config.motions.find((m) => m.id === id) || null;
  }

  function timeAgo(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  }

  // Build one keyframe rule per motion so both thumbnails and previews share it.
  function installMotionKeyframes() {
    const style = document.createElement('style');
    style.textContent = state.config.motions
      .map((m) => `@keyframes motion-${m.id} { from { transform: ${m.css.from}; } to { transform: ${m.css.to}; } }`)
      .join('\n');
    document.head.appendChild(style);
    state.styleSheet = style;
  }

  // Size a video card from its source image's real proportions once known.
  function fitAspect(container, img) {
    const apply = () => {
      if (img.naturalWidth && img.naturalHeight) {
        container.style.setProperty('--ar', `${img.naturalWidth} / ${img.naturalHeight}`);
      }
    };
    if (img.complete) apply();
    else img.addEventListener('load', apply, { once: true });
  }

  function applyMotionVars(el, motion, seconds) {
    el.style.setProperty('--anim', `motion-${motion.id}`);
    el.style.setProperty('--dur', `${motion.css.duration || seconds || 4}s`);
    el.style.setProperty('--ease', motion.css.easing || 'ease-in-out');
    el.style.setProperty('--dir', motion.css.alternate === false ? 'normal' : 'alternate');
  }

  // ---------- views ----------

  function setView(view) {
    state.view = view;
    $$('.nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
    $$('.view').forEach((v) => v.classList.toggle('is-active', v.dataset.view === view));
    $('#viewTitle').textContent = { image: 'Image', video: 'Video', library: 'Library' }[view];
    renderFeeds();
  }

  // ---------- controls ----------

  function renderChips(container, items, activeId, onPick, labelFn) {
    container.innerHTML = '';
    for (const item of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (item.id === activeId ? ' is-active' : '');
      b.textContent = labelFn ? labelFn(item) : item.name;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(item.id === activeId));
      b.addEventListener('click', () => onPick(item.id));
      container.appendChild(b);
    }
  }

  function renderImageControls() {
    renderChips($('#aspectChips'), state.config.aspectRatios, state.aspectRatio, (id) => {
      state.aspectRatio = id;
      renderImageControls();
    }, (a) => `${a.id} ${a.name}`);
    const styleSelect = $('#styleSelect');
    if (!styleSelect.options.length) {
      for (const s of state.config.styles) styleSelect.add(new Option(s.name, s.id));
      styleSelect.value = 'cinematic';
    }
    const sug = $('#imageSuggestions');
    sug.innerHTML = '';
    for (const text of SUGGESTIONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'suggestion';
      b.textContent = text;
      b.addEventListener('click', () => {
        $('#imagePrompt').value = text;
        $('#imagePrompt').focus();
      });
      sug.appendChild(b);
    }
  }

  function renderVideoControls() {
    renderChips($('#durationChips'), state.config.durations.map((d) => ({ id: d, name: `${d}s` })), state.duration, (id) => {
      state.duration = id;
      renderVideoControls();
    });
    const modelSelect = $('#modelSelect');
    if (!modelSelect.options.length) {
      for (const m of state.config.videoModels) modelSelect.add(new Option(`${m.name} · ${m.description}`, m.id));
      modelSelect.value = 'dop-standard';
    }
    const groups = ['All', ...new Set(state.config.motions.map((m) => m.group))];
    renderChips($('#motionGroups'), groups.map((g) => ({ id: g, name: g })), state.motionGroup, (id) => {
      state.motionGroup = id;
      renderVideoControls();
    });
    renderMotionGrid();
    $('#generateVideoBtn').disabled = !state.refImage;
  }

  function renderMotionGrid() {
    const grid = $('#motionGrid');
    grid.innerHTML = '';
    const list = state.config.motions.filter((m) => state.motionGroup === 'All' || m.group === state.motionGroup);
    for (const m of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'motion' + (m.id === state.motionId ? ' is-active' : '');
      b.title = m.description;
      b.innerHTML = `<div class="motion-thumb"><div class="scene"></div></div><div class="motion-label">${m.name}<small>${m.group}</small></div>`;
      const scene = $('.scene', b);
      scene.style.animationName = `motion-${m.id}`;
      scene.style.setProperty('--dur', `${m.css.duration || 2.4}s`);
      scene.style.setProperty('--ease', m.css.easing || 'ease-in-out');
      scene.style.setProperty('--dir', m.css.alternate === false ? 'normal' : 'alternate');
      b.addEventListener('click', () => {
        state.motionId = m.id;
        renderMotionGrid();
      });
      grid.appendChild(b);
    }
  }

  // ---------- reference image ----------

  function setRefImage(ref) {
    state.refImage = ref;
    $('#dropEmpty').hidden = Boolean(ref);
    $('#dropPreview').hidden = !ref;
    if (ref) $('#refImage').src = ref.url;
    $('#generateVideoBtn').disabled = !ref;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadFile(file) {
    if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      toast('Please choose a PNG, JPEG, WebP or GIF image.', 'error');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast('Image must be under 12 MB.', 'error');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const up = await api('/api/upload', { method: 'POST', body: { dataUrl, name: file.name } });
      setRefImage({ url: up.url, name: up.name });
      toast('Reference image ready.');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function wireDropzone() {
    const zone = $('#dropzone');
    const input = $('#fileInput');
    zone.addEventListener('click', (e) => {
      if (e.target.closest('#clearRef')) return;
      input.click();
    });
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });
    input.addEventListener('change', () => {
      uploadFile(input.files[0]);
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.remove('is-over');
    }));
    zone.addEventListener('drop', (e) => uploadFile(e.dataTransfer.files[0]));
    $('#clearRef').addEventListener('click', (e) => {
      e.stopPropagation();
      setRefImage(null);
    });
    document.addEventListener('paste', (e) => {
      if (state.view !== 'video') return;
      const file = [...(e.clipboardData?.files || [])][0];
      if (file) uploadFile(file);
    });
  }

  // ---------- generation ----------

  async function generateImage() {
    const prompt = $('#imagePrompt').value.trim();
    if (!prompt) {
      toast('Write a prompt first.', 'error');
      $('#imagePrompt').focus();
      return;
    }
    const btn = $('#generateImageBtn');
    btn.disabled = true;
    try {
      const job = await api('/api/generate/image', {
        method: 'POST',
        body: { prompt, aspectRatio: state.aspectRatio, style: $('#styleSelect').value, count: Number($('#countSelect').value) },
      });
      state.jobs.unshift(job);
      renderFeeds();
      schedulePoll(800);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function generateVideo() {
    if (!state.refImage) return;
    const btn = $('#generateVideoBtn');
    btn.disabled = true;
    try {
      const job = await api('/api/generate/video', {
        method: 'POST',
        body: {
          imageUrl: state.refImage.url,
          motionId: state.motionId,
          model: $('#modelSelect').value,
          duration: state.duration,
          prompt: $('#videoPrompt').value.trim(),
        },
      });
      state.jobs.unshift(job);
      renderFeeds();
      schedulePoll(800);
      if (job.note) toast(job.note);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = !state.refImage;
    }
  }

  // ---------- polling ----------

  function pendingJobs() {
    return state.jobs.filter((j) => j.status === 'queued' || j.status === 'in_progress');
  }

  function schedulePoll(delay) {
    clearTimeout(state.pollTimer);
    state.pollTimer = setTimeout(poll, delay);
  }

  async function poll() {
    try {
      const before = new Map(state.jobs.map((j) => [j.id, j.status]));
      state.jobs = await api('/api/jobs');
      for (const job of state.jobs) {
        const prev = before.get(job.id);
        if (prev && prev !== job.status && (job.status === 'failed' || job.status === 'nsfw')) {
          toast(`${job.kind === 'image' ? 'Image' : 'Video'} failed: ${job.error || job.status}`, 'error');
        }
      }
      renderFeeds();
    } catch (err) {
      console.warn('poll failed', err);
    }
    schedulePoll(pendingJobs().length ? 2500 : 15000);
  }

  // ---------- rendering ----------

  function renderFeeds() {
    const images = state.jobs.filter((j) => j.kind === 'image');
    const videos = state.jobs.filter((j) => j.kind === 'video');
    renderGrid($('#imageFeed'), images.slice(0, 24), $('#imageEmpty'));
    renderGrid($('#videoFeed'), videos.slice(0, 24), $('#videoEmpty'));
    const lib = state.jobs.filter((j) => state.libraryFilter === 'all' || j.kind === state.libraryFilter);
    renderGrid($('#libraryFeed'), lib, $('#libraryEmpty'));
    $('#libraryCount').textContent = `${lib.length} item${lib.length === 1 ? '' : 's'}`;
    const pending = pendingJobs().length;
    const chip = $('#queueChip');
    chip.hidden = !pending;
    chip.textContent = `${pending} generating`;
  }

  function renderGrid(container, jobs, emptyEl) {
    emptyEl.hidden = jobs.length > 0;
    const seen = new Set();
    for (const job of jobs) {
      seen.add(job.id);
      let card = container.querySelector(`[data-id="${job.id}"]`);
      const signature = `${job.status}|${(job.progress || 0).toFixed(2)}|${(job.outputs || []).length}`;
      if (card && card.dataset.sig === signature) continue;
      const fresh = buildCard(job);
      fresh.dataset.sig = signature;
      if (card) card.replaceWith(fresh);
      else container.appendChild(fresh);
    }
    for (const card of [...container.children]) {
      if (!seen.has(card.dataset.id)) card.remove();
    }
    // Keep DOM order aligned with the job order.
    const ordered = jobs.map((j) => container.querySelector(`[data-id="${j.id}"]`)).filter(Boolean);
    ordered.forEach((el) => container.appendChild(el));
  }

  function iconBtn(label, svgPath, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-ghost btn-icon';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.innerHTML = `<svg viewBox="0 0 24 24">${svgPath}</svg>`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  const ICONS = {
    animate: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
    download: '<path d="M12 4v12m0 0l-4-4m4 4l4-4"/><path d="M4 20h16"/>',
    reuse: '<path d="M4 4v6h6"/><path d="M20 20v-6h-6"/><path d="M20 10a8 8 0 00-14.5-3.5L4 10"/><path d="M4 14a8 8 0 0014.5 3.5L20 14"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  };

  function buildCard(job) {
    const tpl = $('#cardTemplate').content.firstElementChild.cloneNode(true);
    tpl.dataset.id = job.id;
    tpl.classList.toggle('is-failed', job.status === 'failed' || job.status === 'nsfw');
    const media = $('.card-media', tpl);
    const status = $('.card-status', tpl);
    const actions = $('.card-actions', tpl);
    const caption = $('.card-caption', tpl);
    const pending = job.status === 'queued' || job.status === 'in_progress';
    const ar = job.kind === 'image' ? aspectCss(job.aspectRatio) : '4 / 5';
    media.style.setProperty('--ar', ar);

    if (pending) {
      media.classList.add('pending');
      if (job.sourceImageUrl) {
        const img = document.createElement('img');
        img.src = job.sourceImageUrl;
        img.alt = '';
        fitAspect(media, img);
        media.appendChild(img);
      }
      media.insertAdjacentHTML('beforeend', `<div class="shimmer"></div><div class="pending-center"><div class="spinner"></div><span>${job.status === 'queued' ? 'Queued' : 'Rendering'}…</span></div><div class="progress"><i style="--p:${Math.round((job.progress || 0) * 100)}%"></i></div>`);
    } else if (job.status === 'completed' && job.outputs.length) {
      const out = job.outputs[0];
      renderOutput(media, job, out);
      media.style.cursor = 'zoom-in';
      media.addEventListener('click', () => openLightbox(job, 0));
      if (job.outputs.length > 1) {
        const b = document.createElement('span');
        b.className = 'badge';
        b.textContent = `${job.outputs.length} results`;
        status.appendChild(b);
      }
    } else {
      media.classList.add('pending');
      if (job.sourceImageUrl) {
        const img = document.createElement('img');
        img.src = job.sourceImageUrl;
        img.alt = '';
        media.appendChild(img);
      }
      media.insertAdjacentHTML('beforeend', `<div class="card-error">${escapeHtml(job.error || 'Generation failed')}</div>`);
    }

    const badge = document.createElement('span');
    badge.className = `badge ${job.status}`;
    badge.textContent = job.kind === 'video' ? job.motionName : job.aspectRatio;
    status.prepend(badge);
    if (!pending && job.status !== 'completed') {
      const sb = document.createElement('span');
      sb.className = `badge ${job.status}`;
      sb.textContent = job.status;
      status.appendChild(sb);
    }

    if (job.status === 'completed') {
      const out = job.outputs[0];
      if (job.kind === 'image') {
        actions.appendChild(iconBtn('Animate this image', ICONS.animate, () => {
          setRefImage({ url: out.url, name: job.prompt });
          setView('video');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }));
      }
      if (out.type !== 'motion-preview') {
        actions.appendChild(iconBtn('Download', ICONS.download, () => download(out.url, `${job.kind}-${job.id}`)));
      }
    }
    if (job.kind === 'image') {
      actions.appendChild(iconBtn('Reuse prompt', ICONS.reuse, () => {
        $('#imagePrompt').value = job.prompt;
        setView('image');
        $('#imagePrompt').focus();
      }));
    }
    actions.appendChild(iconBtn('Delete', ICONS.trash, () => deleteJob(job)));

    caption.innerHTML = job.kind === 'video'
      ? `<b>${escapeHtml(job.motionName)}</b> · ${job.duration}s · ${timeAgo(job.createdAt)}`
      : `<b>${escapeHtml(job.prompt)}</b> · ${timeAgo(job.createdAt)}`;
    caption.title = job.prompt || '';
    return tpl;
  }

  function renderOutput(container, job, out) {
    container.innerHTML = '';
    if (out.type === 'image') {
      const img = document.createElement('img');
      img.src = out.url;
      img.alt = job.prompt;
      img.loading = 'lazy';
      container.appendChild(img);
    } else if (out.type === 'video') {
      const v = document.createElement('video');
      v.src = out.url;
      v.muted = true;
      v.loop = true;
      v.autoplay = true;
      v.playsInline = true;
      if (out.thumbnailUrl) v.poster = out.thumbnailUrl;
      container.appendChild(v);
    } else if (out.type === 'motion-preview') {
      const motion = motionById(out.motionId) || motionById(job.motionId);
      container.classList.add('motion-preview');
      if (motion?.css?.blur) container.classList.add('blur');
      applyMotionVars(container, motion, out.duration);
      const backdrop = document.createElement('img');
      backdrop.className = 'backdrop';
      backdrop.src = out.imageUrl;
      backdrop.alt = '';
      container.appendChild(backdrop);
      const img = document.createElement('img');
      img.src = out.imageUrl;
      img.alt = `${motion.name} preview`;
      fitAspect(container, img);
      container.appendChild(img);
    }
  }

  async function deleteJob(job) {
    try {
      await api(`/api/jobs/${job.id}`, { method: 'DELETE' });
      state.jobs = state.jobs.filter((j) => j.id !== job.id);
      renderFeeds();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function download(url, name) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- lightbox ----------

  function openLightbox(job, index) {
    const out = job.outputs[index];
    const body = $('#lightboxBody');
    body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.setProperty('--ar', job.kind === 'image' ? aspectCss(job.aspectRatio) : '4 / 5');
    renderOutput(wrap, job, out);
    if (out.type === 'motion-preview') wrap.classList.add('motion-preview');
    body.appendChild(wrap);
    const meta = $('#lightboxMeta');
    meta.innerHTML = '';
    const text = document.createElement('span');
    text.textContent = job.kind === 'video' ? `${job.motionName} · ${job.model} · ${job.duration}s${job.prompt ? ' · ' + job.prompt : ''}` : job.fullPrompt || job.prompt;
    meta.appendChild(text);
    if (job.outputs.length > 1) {
      const nav = document.createElement('div');
      nav.className = 'chip-group';
      job.outputs.forEach((o, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip' + (i === index ? ' is-active' : '');
        b.textContent = String(i + 1);
        b.addEventListener('click', () => openLightbox(job, i));
        nav.appendChild(b);
      });
      meta.appendChild(nav);
    }
    $('#lightbox').hidden = false;
  }

  function closeLightbox() {
    $('#lightbox').hidden = true;
    $('#lightboxBody').innerHTML = '';
  }

  // ---------- init ----------

  async function init() {
    try {
      state.config = await api('/api/config');
    } catch (err) {
      toast(`Could not load configuration: ${err.message}`, 'error');
      return;
    }
    const pill = $('#modePill');
    pill.textContent = state.config.mode === 'mock' ? 'Mock mode' : 'Live';
    pill.classList.toggle('is-live', state.config.mode !== 'mock');
    pill.title = state.config.mode === 'mock' ? 'No API keys set: renders are simulated locally.' : `Connected to ${state.config.mode}`;

    installMotionKeyframes();
    renderImageControls();
    renderVideoControls();
    wireDropzone();

    $$('.nav-item').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    $('#generateImageBtn').addEventListener('click', generateImage);
    $('#generateVideoBtn').addEventListener('click', generateVideo);
    $('#imagePrompt').addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') generateImage();
    });
    $('#videoPrompt').addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') generateVideo();
    });
    $$('#libraryFilters .chip').forEach((b) => b.addEventListener('click', () => {
      state.libraryFilter = b.dataset.filter;
      $$('#libraryFilters .chip').forEach((x) => x.classList.toggle('is-active', x === b));
      renderFeeds();
    }));
    $('#lightboxClose').addEventListener('click', closeLightbox);
    $('#lightbox').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLightbox();
    });

    await poll();
  }

  init();
})();
