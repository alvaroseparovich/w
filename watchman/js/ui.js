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

    const del = document.createElement('button');
    del.className = 'btn';
    del.textContent = 'Delete';
    del.addEventListener('click', () => onDelete(t.id));

    actions.append(del);
    li.append(titleWrap, elapsed, actions);
    els.archiveList.appendChild(li);
  }
}

function renderFooter() {
  const id = manager.activeTaskId;
  if (!id) {
    els.np.classList.add('hidden');
    return;
  }
  const t = manager.getById(id);
  if (!t) {
    els.np.classList.add('hidden');
    return;
  }
  els.np.classList.remove('hidden');
  els.npTitle.textContent = t.title;
  els.npElapsed.textContent = formatHMS(t.elapsed());
  els.npToggle.textContent = t.isRunning ? 'Pause' : 'Resume';
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
