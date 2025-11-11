// Core logic layer: Task model and manager. No DOM here.
// This can be reused and unit-tested easily.

export class Task {
  constructor(id, title) {
    this.id = id;
    this.title = title;
    this.intervals = []; // [{start: number, end?: number}]
  }

  get isRunning() {
    const last = this.intervals[this.intervals.length - 1];
    return !!last && last.end == null;
  }

  start(at = Date.now()) {
    if (this.isRunning) return;
    this.intervals.push({ start: at });
  }

  pause(at = Date.now()) {
    if (!this.isRunning) return;
    const last = this.intervals[this.intervals.length - 1];
    last.end = at;
  }

  reset() {
    this.intervals = [];
  }

  // total elapsed ms
  elapsed(at = Date.now()) {
    let total = 0;
    for (const itv of this.intervals) {
      const end = itv.end ?? at;
      total += Math.max(0, end - itv.start);
    }
    return total;
  }
}

export class TaskManager {
  constructor(storage) {
    this.storage = storage;
    this.tasks = [];
    this.activeTaskId = null;
  }

  create(title) {
    const id = crypto.randomUUID();
    const t = new Task(id, title.trim());
    this.tasks.unshift(t);
    this.persist();
    return t;
  }

  remove(id) {
    const idx = this.tasks.findIndex(t => t.id === id);
    if (idx >= 0) {
      // if removing active, clear footer
      if (this.activeTaskId === id) this.activeTaskId = null;
      this.tasks.splice(idx, 1);
      this.persist();
    }
  }

  getById(id) { return this.tasks.find(t => t.id === id) || null; }

  // Ensure only one running at a time (like a media player)
  toggleRun(id) {
    const target = this.getById(id);
    if (!target) return;

    if (target.isRunning) {
      target.pause();
      if (this.activeTaskId === id) this.activeTaskId = null;
    } else {
      // pause any other running task
      for (const t of this.tasks) if (t.isRunning) t.pause();
      target.start();
      this.activeTaskId = id;
    }
    this.persist();
    return target;
  }

  tick() { /* marker for UI to re-render elapsed */ }

  serialize() {
    return {
      tasks: this.tasks.map(t => ({ id: t.id, title: t.title, intervals: t.intervals })),
      activeTaskId: this.activeTaskId,
    };
  }

  persist() {
    this.storage.save(this.serialize());
  }

  static revive(data) {
    const mgr = new TaskManager(new MemoryStorage());
    if (!data) return mgr;
    for (const raw of data.tasks || []) {
      const t = new Task(raw.id, raw.title);
      t.intervals = (raw.intervals || []).map(itv => ({ start: itv.start, end: itv.end ?? undefined }));
      mgr.tasks.push(t);
    }
    mgr.activeTaskId = data.activeTaskId || null;
    return mgr;
  }
}

export class LocalStorageDriver {
  constructor(key = 'watchman:v1') { this.key = key; }
  load() {
    try { return JSON.parse(localStorage.getItem(this.key) || 'null'); } catch { return null; }
  }
  save(data) {
    localStorage.setItem(this.key, JSON.stringify(data));
  }
}

// fallback if needed
export class MemoryStorage {
  constructor() { this.data = null; }
  load() { return this.data; }
  save(d) { this.data = d; }
}

export function formatHMS(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600).toString().padStart(2, '0');
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(total % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}
