import { TaskManager, LocalStorageDriver, formatHMS } from './core.js';

const els = {
  name: /** @type {HTMLInputElement} */(document.getElementById('taskName')),
  addBtn: document.getElementById('addTaskBtn'),
  list: document.getElementById('taskList'),
  np: document.getElementById('nowPlaying'),
  npTitle: document.getElementById('npTitle'),
  npElapsed: document.getElementById('npElapsed'),
  npToggle: document.getElementById('npToggle'),
};

const storage = new LocalStorageDriver();
const saved = storage.load();
let manager = TaskManager.revive(saved);
manager.storage = storage; // bind real storage

function render() {
  // list
  els.list.innerHTML = '';
  for (const t of manager.tasks) {
    const li = document.createElement('li');
    li.className = 'task-item';
    li.dataset.id = t.id;

    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = t.title;

    const elapsed = document.createElement('div');
    elapsed.className = 'task-time';
    elapsed.textContent = formatHMS(t.elapsed());

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const toggle = document.createElement('button');
    toggle.className = 'btn';
    toggle.textContent = t.isRunning ? 'Pause' : 'Start';
    toggle.addEventListener('click', () => onToggle(t.id));

    const reset = document.createElement('button');
    reset.className = 'btn danger';
    reset.textContent = 'Reset';
    reset.addEventListener('click', () => onReset(t.id));

    const remove = document.createElement('button');
    remove.className = 'btn';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => onDelete(t.id));

    actions.append(toggle, reset, remove);
    li.append(title, elapsed, actions);
    els.list.appendChild(li);
  }

  renderFooter();
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

function onReset(id) {
  const t = manager.getById(id);
  if (!t) return;
  t.reset();
  manager.persist();
  render();
}

function onDelete(id) {
  manager.remove(id);
  render();
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

render();
