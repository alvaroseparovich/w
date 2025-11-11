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
    const id = manager.activeTaskId;
    if (!id) return;
    const t = manager.getById(id);
    if (t && !t.isRunning) onToggle(id);
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
      artist: 'Task',
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
  els.np.classList.remove('hidden');
  els.npTitle.textContent = t.title;
  els.npElapsed.textContent = formatHMS(t.elapsed());
  els.npToggle.textContent = t.isRunning ? 'Pause' : 'Resume';

  // Media session sync
  setupMediaSessionHandlers();
  ensureMediaAudio().then(audio => {
    if (t.isRunning) {
      audio.volume = 0.001; // very low
      audio.play().catch(() => {});
    } else {
      audio.volume = 0.0;
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
}

function onToggle(id) {
  manager.toggleRun(id);
  render();
}

function onDelete(id) {
  manager.remove(id);
  render();
}

function onArchive(id) {
  manager.archive(id);
  render();
}

function onUnarchive(id) {
  manager.unarchive(id);
  render();
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
    });
    chip.appendChild(btn);
  }
  return chip;
}

render();
