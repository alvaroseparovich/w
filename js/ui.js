import { TaskManager, LocalStorageDriver, formatHMS } from './core.js';

const els = {
  name: /** @type {HTMLInputElement} */(document.getElementById('taskName')),
  addBtn: document.getElementById('addTaskBtn'),
  list: document.getElementById('taskList'),
  archiveList: document.getElementById('archiveList'),
  tagFilter: document.getElementById('tagFilter'),
  tabActive: document.getElementById('tabActive'),
  tabArchive: document.getElementById('tabArchive'),
  panelActive: document.getElementById('panelActive'),
  panelArchive: document.getElementById('panelArchive'),
  np: document.getElementById('nowPlaying'),
  npTitle: document.getElementById('npTitle'),
  npElapsed: document.getElementById('npElapsed'),
  npToggle: document.getElementById('npToggle'),
};

const storage = new LocalStorageDriver();
const saved = storage.load();
let manager = TaskManager.revive(saved);
manager.storage = storage; // bind real storage
let selectedTag = null;

// --- Sync layer (minimal V1) ---
const Sync = (() => {
  const API_BASE = localStorage.getItem('auth_api_base') || 'https://oy4qoewlgir6gkd5jew452kaay0ffoed.lambda-url.us-east-1.on.aws'; // || 'http://localhost:4000';
  const LS_SYNC = 'watchman_last_sync_at';
  let debounceTimer = null;

  function getIdToken() {
    try {
      const s = JSON.parse(localStorage.getItem('watchman_auth') || 'null');
      return s?.idToken || null;
    } catch { return null; }
  }

  function lastSyncAt() {
    return Number(localStorage.getItem(LS_SYNC) || '0');
  }
  function setLastSyncAt(ms) {
    localStorage.setItem(LS_SYNC, String(ms));
  }

  async function downloadSince(ms) {
    const idToken = getIdToken();
    if (!idToken) return;
    const url = `${API_BASE}/sync/download?since=${encodeURIComponent(ms || 0)}`;
    const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${idToken}` } });
    if (!resp.ok) throw new Error('download_failed');
    const data = await resp.json();
    mergeServerTasks(data.tasks || []);
    setLastSyncAt(Date.now());
  }

  function mergeServerTasks(items) {
    if (!Array.isArray(items)) return;
    // newer-wins by updatedAt
    for (const it of items) {
      const existing = manager.getById(it.id);
      if (!existing) {
        const t = manager.create(it.title || '');
        t.id = it.id; // preserve id
        t.intervals = it.intervals || [];
        t.archived = !!it.archived;
        t.tags = Array.isArray(it.tags) ? Array.from(new Set(it.tags)) : [];
      } else {
        // naive: replace fields
        existing.title = it.title || existing.title;
        existing.intervals = it.intervals || existing.intervals;
        existing.archived = !!it.archived;
        existing.tags = Array.isArray(it.tags) ? Array.from(new Set(it.tags)) : existing.tags;
      }
    }
    manager.persist();
    render();

// Kick initial download after login, or if already logged
window.addEventListener('auth:login', () => {
  Sync.downloadSince(0).catch(console.error);
});
// Try background download on load if token exists
(() => {
  try {
    const s = JSON.parse(localStorage.getItem('watchman_auth') || 'null');
    if (s?.idToken) {
      Sync.downloadSince(Sync.lastSyncAt ? Sync.lastSyncAt() : 0)?.catch?.(console.error);
    }
  } catch {}
})();

  }

  async function uploadAll() {
    const idToken = getIdToken();
    if (!idToken) return;
    const payload = manager.serialize();
    // decorate with updatedAt/version for V1 (client-generated)
    const tasks = (payload.tasks || []).map(t => ({
      id: t.id,
      title: t.title,
      intervals: t.intervals,
      archived: !!t.archived,
      tags: t.tags || [],
      updatedAt: Date.now(),
      version: 0,
    }));
    await fetch(`${API_BASE}/sync/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks })
    });
    setLastSyncAt(Date.now());
  }

  function scheduleUpload() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { uploadAll().catch(console.error); }, 1200);
  }

  return { downloadSince, scheduleUpload };
})();

// Media Session support for OS-level play/pause notification
const mediaCtrl = {
  audio: null,
  activeTaskId: null,
};

function makeNoiseWavDataUri(durationSec = 0.5, sampleRate = 8000) {
  const channels = 1;
  const bytesPerSample = 1; // 8-bit PCM
  const frames = Math.floor(durationSec * sampleRate);
  const dataSize = frames * channels * bytesPerSample;
  const buffer = new Uint8Array(44 + dataSize);
  const view = new DataView(buffer.buffer);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) buffer[off + i] = s.charCodeAt(i); };
  const write32 = (off, v) => view.setUint32(off, v, true);
  const write16 = (off, v) => view.setUint16(off, v, true);
  // RIFF/WAVE header
  writeStr(0, 'RIFF'); write32(4, 36 + dataSize); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); write32(16, 16); write16(20, 1); write16(22, channels);
  write32(24, sampleRate); write32(28, sampleRate * channels * bytesPerSample);
  write16(32, channels * bytesPerSample); write16(34, 8 * bytesPerSample);
  writeStr(36, 'data'); write32(40, dataSize);
  // noise data 0..255
  let off = 44;
  for (let i = 0; i < frames; i++) buffer[off++] = Math.floor(Math.random() * 256);
  let bin = '';
  for (let i = 0; i < buffer.length; i++) bin += String.fromCharCode(buffer[i]);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

async function ensureMediaAudio() {
  if (mediaCtrl.audio) return mediaCtrl.audio;
  const el = new Audio();
  el.src = makeNoiseWavDataUri();
  el.loop = true;
  el.preload = 'auto';
  el.volume = 0.0; // will raise slightly when playing
  mediaCtrl.audio = el;
  return el;
}

function setupMediaSessionHandlers() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.setActionHandler('play', () => {
    // If there is an active task, resume if paused; otherwise resume the last active task
    let id = manager.activeTaskId;
    if (!id && mediaCtrl.activeTaskId) id = mediaCtrl.activeTaskId;
    if (!id) return;
    const t = manager.getById(id);
    if (!t) return;
    if (!t.isRunning) onToggle(id);
  });
  navigator.mediaSession.setActionHandler('pause', () => {
    const id = manager.activeTaskId;
    if (!id) return;
    const t = manager.getById(id);
    if (t && t.isRunning) onToggle(id);
  });
}

function updateMediaSession(task, isPlaying) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: task?.title || 'Watchman',
      artist: 'Task Handler',
      album: 'Watchman',
    });
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  } catch {}
}

function render() {
  // filter bar
  renderFilter();

  // active list
  els.list.innerHTML = '';
  const activeTasks = selectedTag ? manager.getTasksByTag(selectedTag).filter(t => !t.archived) : manager.activeTasks;
  for (const t of activeTasks) {
    const li = document.createElement('li');
    li.className = 'task-item';
    li.dataset.id = t.id;

    const titleWrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = t.title;

    const tags = document.createElement('div');
    tags.className = 'tags';
    for (const tag of t.tags || []) {
      tags.appendChild(renderTagChip(t.id, tag));
    }

    const addWrap = document.createElement('div');
    addWrap.style.marginTop = '6px';
    const tagInput = document.createElement('input');
    tagInput.placeholder = 'Add tag…';
    tagInput.className = 'input-tag';
    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = tagInput.value.trim();
        if (v) {
          manager.addTag(t.id, v);
          tagInput.value = '';
          render();
          Sync.scheduleUpload();
        }
      }
    });
    addWrap.append(tagInput);

    titleWrap.append(title, tags, addWrap);

    const elapsed = document.createElement('div');
    elapsed.className = 'task-time';
    elapsed.textContent = formatHMS(t.elapsed());

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const toggle = document.createElement('button');
    toggle.className = 'btn';
    toggle.textContent = t.isRunning ? 'Pause' : 'Start';
    toggle.addEventListener('click', () => onToggle(t.id));

    const archive = document.createElement('button');
    archive.className = 'btn';
    archive.textContent = 'Archive';
    archive.addEventListener('click', () => onArchive(t.id));

    actions.append(toggle, archive);
    li.append(titleWrap, elapsed, actions);
    els.list.appendChild(li);
  }

  renderFooter();

  // archive list
  els.archiveList.innerHTML = '';
  for (const t of manager.archivedTasks) {
    const li = document.createElement('li');
    li.className = 'task-item';
    li.dataset.id = t.id;

    const titleWrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = t.title;
    const tags = document.createElement('div');
    tags.className = 'tags';
    for (const tag of t.tags || []) tags.appendChild(renderTagChip(t.id, tag, true));
    titleWrap.append(title, tags);

    const elapsed = document.createElement('div');
    elapsed.className = 'task-time';
    elapsed.textContent = formatHMS(t.elapsed());

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const unarch = document.createElement('button');
    unarch.className = 'btn';
    unarch.textContent = 'Unarchive';
    unarch.addEventListener('click', () => onUnarchive(t.id));

    const del = document.createElement('button');
    del.className = 'btn danger';
    del.textContent = 'Delete';
    del.addEventListener('click', () => onDelete(t.id));

    actions.append(unarch, del);
    li.append(titleWrap, elapsed, actions);
    els.archiveList.appendChild(li);
  }
}

function renderFooter() {
  const id = manager.activeTaskId;
  if (!id) {
    els.np.classList.add('hidden');
    // stop media session if any
    if (mediaCtrl.audio) {
      mediaCtrl.audio.pause();
      updateMediaSession(null, false);
    }
    return;
  }
  const t = manager.getById(id);
  if (!t) {
    els.np.classList.add('hidden');
    if (mediaCtrl.audio) {
      mediaCtrl.audio.pause();
      updateMediaSession(null, false);
    }
    return;
  }
  // Remember last active task for OS play handler
  mediaCtrl.activeTaskId = t.id;
  els.np.classList.remove('hidden');
  els.npTitle.textContent = t.title;
  els.npElapsed.textContent = formatHMS(t.elapsed());
  els.npToggle.textContent = t.isRunning ? 'Pause' : 'Resume';

  // Media session sync
  setupMediaSessionHandlers();
  ensureMediaAudio().then(audio => {
    audio.volume = 0.0;
    if (t.isRunning) {
      audio.play().catch((e) => {console.log(e)});
    } else {
      audio.pause();
    }
    updateMediaSession(t, t.isRunning);
  });
}

function onAdd() {
  const name = els.name.value.trim();
  if (!name) return;
  manager.create(name);
  els.name.value = '';
  render();
  Sync.scheduleUpload();
}

function onToggle(id) {
  manager.toggleRun(id);
  render();
  Sync.scheduleUpload();
}

function onDelete(id) {
  manager.remove(id);
  render();
  Sync.scheduleUpload();
}

function onArchive(id) {
  manager.archive(id);
  render();
  Sync.scheduleUpload();
}

function onUnarchive(id) {
  manager.unarchive(id);
  render();
  Sync.scheduleUpload();
}

function renderFilter() {
  const tags = Object.keys(manager.tagsIndex).sort();
  els.tagFilter.innerHTML = '';
  // All chip
  const all = document.createElement('span');
  all.className = 'tag filter' + (!selectedTag ? ' selected' : '');
  all.textContent = 'All';
  all.addEventListener('click', () => { selectedTag = null; render(); });
  els.tagFilter.appendChild(all);
  for (const tag of tags) {
    const chip = document.createElement('span');
    chip.className = 'tag filter' + (selectedTag === tag ? ' selected' : '');
    chip.textContent = tag;
    chip.addEventListener('click', () => { selectedTag = (selectedTag === tag ? null : tag); render(); });
    els.tagFilter.appendChild(chip);
  }
}

// Footer controls
els.npToggle.addEventListener('click', () => {
  const id = manager.activeTaskId;
  if (!id) return;
  manager.toggleRun(id);
  render();
});

// Add task
els.addBtn.addEventListener('click', onAdd);
els.name.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') onAdd();
});

// Tabs
els.tabActive.addEventListener('click', () => {
  els.tabActive.classList.add('active');
  els.tabArchive.classList.remove('active');
  els.panelActive.classList.remove('hidden');
  els.panelArchive.classList.add('hidden');
});
els.tabArchive.addEventListener('click', () => {
  els.tabArchive.classList.add('active');
  els.tabActive.classList.remove('active');
  els.panelArchive.classList.remove('hidden');
  els.panelActive.classList.add('hidden');
});

// Tick every second for elapsed updates
setInterval(() => {
  manager.tick();
  const id = manager.activeTaskId;
  // update times without full rerender
  document.querySelectorAll('.task-item').forEach(item => {
    const tid = item.dataset.id;
    const t = manager.getById(tid);
    if (t) item.querySelector('.task-time').textContent = formatHMS(t.elapsed());
  });
  if (id) {
    const t = manager.getById(id);
    if (t) els.npElapsed.textContent = formatHMS(t.elapsed());
  }
}, 1000);

function renderTagChip(taskId, tag, archived = false) {
  const chip = document.createElement('span');
  chip.className = 'tag';
  chip.textContent = tag;
  if (!archived) {
    const btn = document.createElement('button');
    btn.className = 'remove-tag';
    btn.title = 'Remove tag';
    btn.textContent = '×';
    btn.addEventListener('click', () => {
      manager.removeTag(taskId, tag);
      render();
      Sync.scheduleUpload();
    });
    chip.appendChild(btn);
  }
  return chip;
}

render();
