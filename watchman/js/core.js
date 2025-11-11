// Core logic layer: Task model and manager. No DOM here.
// This can be reused and unit-tested easily.

export class Task {
  constructor(id, title) {
    this.id = id;
    this.title = title;
    this.intervals = []; // [{start: number, end?: number}]
    this.archived = false;
    this.tags = [];
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
    // Inverted index: tag -> array of taskIds
    this.tagsIndex = {};
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
      const [removed] = this.tasks.splice(idx, 1);
      // remove from tags index
      if (removed && Array.isArray(removed.tags)) {
        for (const tag of removed.tags) this._idxRemove(tag, removed.id);
      }
      this.persist();
    }
  }

  getById(id) { return this.tasks.find(t => t.id === id) || null; }

  get activeTasks() { return this.tasks.filter(t => !t.archived); }
  get archivedTasks() { return this.tasks.filter(t => t.archived); }

  // Ensure only one running at a time (like a media player)
  toggleRun(id) {
    const target = this.getById(id);
    if (!target) return;
    if (target.archived) return; // cannot run archived tasks

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

  // Archive a task: stop all timers and move task to archived
  archive(id) {
    const target = this.getById(id);
    if (!target) return;
    // Stop all running timers
    for (const t of this.tasks) if (t.isRunning) t.pause();
    this.activeTaskId = null;
    // Mark archived
    target.archived = true;
    this.persist();
    return target;
  }

  tick() { /* marker for UI to re-render elapsed */ }

  serialize() {
    return {
      tasks: this.tasks.map(t => ({ id: t.id, title: t.title, intervals: t.intervals, archived: !!t.archived, tags: Array.from(t.tags || []) })),
      activeTaskId: this.activeTaskId,
      tagsIndex: this.tagsIndex,
    };
  }

  persist() {
    this.storage.save(this.serialize());
  }

  // Tag utilities
  static _normTag(tag) {
    return String(tag || '').trim().toLowerCase();
  }

  addTag(taskId, tag) {
    const t = this.getById(taskId);
    if (!t) return;
    const norm = TaskManager._normTag(tag);
    if (!norm) return;
    if (!t.tags.includes(norm)) t.tags.push(norm);
    this._idxAdd(norm, t.id);
    this.persist();
  }

  removeTag(taskId, tag) {
    const t = this.getById(taskId);
    if (!t) return;
    const norm = TaskManager._normTag(tag);
    const i = t.tags.indexOf(norm);
    if (i >= 0) t.tags.splice(i, 1);
    this._idxRemove(norm, t.id);
    this.persist();
  }

  getIdsByTag(tag) {
    const norm = TaskManager._normTag(tag);
    return Array.from(this.tagsIndex[norm] || []);
  }

  getTasksByTag(tag) {
    const ids = this.getIdsByTag(tag);
    return ids.map(id => this.getById(id)).filter(Boolean);
  }

  _idxAdd(tag, id) {
    const norm = TaskManager._normTag(tag);
    if (!norm) return;
    if (!this.tagsIndex[norm]) this.tagsIndex[norm] = [];
    if (!this.tagsIndex[norm].includes(id)) this.tagsIndex[norm].push(id);
  }

  _idxRemove(tag, id) {
    const norm = TaskManager._normTag(tag);
    const arr = this.tagsIndex[norm];
    if (!arr) return;
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    if (arr.length === 0) delete this.tagsIndex[norm];
  }

  static revive(data) {
    const mgr = new TaskManager(new MemoryStorage());
    if (!data) return mgr;
    for (const raw of data.tasks || []) {
      const t = new Task(raw.id, raw.title);
      t.intervals = (raw.intervals || []).map(itv => ({ start: itv.start, end: itv.end ?? undefined }));
      t.archived = !!raw.archived;
      t.tags = Array.isArray(raw.tags) ? Array.from(new Set(raw.tags.map(TaskManager._normTag))) : [];
      mgr.tasks.push(t);
    }
    mgr.activeTaskId = data.activeTaskId || null;
    // Rebuild index from tasks to ensure consistency
    mgr.tagsIndex = {};
    for (const t of mgr.tasks) {
      for (const tag of t.tags) mgr._idxAdd(tag, t.id);
    }
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
