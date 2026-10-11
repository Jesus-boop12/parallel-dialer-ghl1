'use strict';

const fs = require('fs');
const path = require('path');

// Tiny JSON-file job store. Writes are debounced and atomic (write temp, rename).
class JobStore {
  constructor(file) {
    this.file = file;
    this.jobs = new Map();
    this.timer = null;
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const list = JSON.parse(raw);
      for (const job of list) this.jobs.set(job.id, job);
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn('[store] could not read jobs file:', err.message);
    }
  }

  all() {
    return [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  get(id) {
    return this.jobs.get(id) || null;
  }

  put(job) {
    this.jobs.set(job.id, job);
    this.scheduleFlush();
    return job;
  }

  patch(id, changes) {
    const job = this.jobs.get(id);
    if (!job) return null;
    Object.assign(job, changes, { updatedAt: Date.now() });
    this.scheduleFlush();
    return job;
  }

  remove(id) {
    const ok = this.jobs.delete(id);
    if (ok) this.scheduleFlush();
    return ok;
  }

  scheduleFlush() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 150);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  flush() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.all(), null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.warn('[store] could not write jobs file:', err.message);
    }
  }
}

module.exports = { JobStore };
