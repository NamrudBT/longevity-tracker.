const STORAGE_KEY = 'longevity_data_v3';
let state = { currentWeek: 1, startDate: '', healthMetrics: [], habits: [], streaks: { smoke: 0, alcohol: 0 } };
let deferredPrompt;

document.addEventListener('DOMContentLoaded', () => {
  loadData(); setupNav(); calculatePhase(); renderAll(); hideLoading(); checkInstall(); checkClearance();
  resetHabitsIfNewDay();
  setInterval(checkMidnight, 60000);
});

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) state = { ...state, ...JSON.parse(saved) };
  if (!state.habits.length) state.habits = DEFAULT_HABITS;
  state.healthMetrics.forEach(m => m.id = m.id || Date.now());
}

function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function hideLoading() {
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
}

function renderAll() {
  renderToday(); renderHealthView(); renderProgressView(); renderSettings();
}

function renderToday() {
  document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  document.getElementById('current-week').textContent = state.currentWeek;
  const pct = Math.round((state.currentWeek / 52) * 100);
  document.getElementById('phase-progress-fill').style.width = pct + '%';
  document.getElementById('phase-progress-percent').textContent = pct;

  const today = new Date().toISOString().split('T')[0];
  const todayLog = state.healthMetrics.find(m => m.date === today) || {};
  document.getElementById('bp-value').textContent = todayLog.bp ? `${todayLog.bp.sys}/${todayLog.bp.dia}` : '--/--';
  document.getElementById('weight-value').textContent = todayLog.weight || '--';
  document.getElementById('smoke-free-days').textContent = state.streaks.smoke;
  document.getElementById('alcohol-free-days').textContent = state.streaks.alcohol;

  document.getElementById('habits-list').innerHTML = state.habits.map(h => `
    <div class="habit-item ${h.completed ? 'completed' : ''}" onclick="toggleHabit('${h.id}')">
      <div class="habit-info"><div class="habit-icon">${h.icon}</div><div class="habit-name">${h.name}</div></div>
      <div class="habit-checkbox">${h.completed ? 'Checkmark' : ''}</div>
    </div>
  `).join('');
}

function toggleHabit(id) {
  const h = state.habits.find(h => h.id === id);
  h.completed = !h.completed;
  saveData(); renderToday(); showToast(h.completed ? 'Habit completed!' : 'Habit reset');
  vibrate();
}

function startWorkout() {
  if (!localStorage.getItem('medical_clearance') && state.currentWeek <= 4) {
    document.getElementById('clearance-modal').classList.add('active');
    return;
  }
  showToast('Workout started!');
  switchView('workout');
  document.getElementById('workout-content').innerHTML = `<h2>Foundation Day A</h2><p>Log sets in Health tab.</p><button class="btn-primary" onclick="switchView('today')">Done</button>`;
}

function openHealthModal(entry = null) {
  const isEdit = !!entry;
  document.getElementById('modal-content').innerHTML = `
    <div class="modal-header"><h2>${isEdit ? 'Edit' : 'Log'} Metrics</h2><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <div class="settings-group" style="display:flex;gap:8px;">
        <input type="number" id="bp-sys" placeholder="120" value="${entry?.bp?.sys || ''}">
        <span>/</span>
        <input type="number" id="bp-dia" placeholder="80" value="${entry?.bp?.dia || ''}">
      </div>
      <div class="settings-group"><input type="number" id="weight" placeholder="Weight (lbs)" value="${entry?.weight || ''}"></div>
    </div>
    <div class="modal-footer">
      <button class="btn-primary" onclick="${isEdit ? `saveEdit('${entry.id}')` : 'saveHealth()'}">Save</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('active');
}

function saveHealth() {
  const today = new Date().toISOString().split('T')[0];
  const entry = {
    id: Date.now(),
    date: today,
    bp: { sys: +document.getElementById('bp-sys').value, dia: +document.getElementById('bp-dia').value },
    weight: +document.getElementById('weight').value
  };
  state.healthMetrics.push(entry);
  saveData(); closeModal(); renderAll(); showToast('Logged!');
}

function saveEdit(id) {
  const entry = state.healthMetrics.find(m => m.id === id);
  entry.bp.sys = +document.getElementById('bp-sys').value;
  entry.bp.dia = +document.getElementById('bp-dia').value;
  entry.weight = +document.getElementById('weight').value;
  saveData(); closeModal(); renderAll(); showToast('Updated!');
}

function deleteHealth(id) {
  if (confirm('Delete this log?')) {
    state.healthMetrics = state.healthMetrics.filter(m => m.id !== id);
    saveData(); renderHealthView(); showToast('Deleted');
  }
}

function renderHealthView() {
  const sorted = [...state.healthMetrics].sort((a,b) => new Date(b.date) - new Date(a.date));
  document.getElementById('health-history').innerHTML = sorted.map(m => `
    <div class="history-item">
      <div class="history-date">${new Date(m.date).toLocaleDateString()}</div>
      <div class="history-values">
        ${m.bp ? `<span>BP: ${m.bp.sys}/${m.bp.dia}</span>` : ''}
        ${m.weight ? `<span>Weight: ${m.weight} lbs</span>` : ''}
      </div>
      <div class="history-actions">
        <button class="btn-icon" onclick="openHealthModal(state.healthMetrics.find(e=>e.id==${m.id}))">Edit</button>
        <button class="btn-icon danger" onclick="deleteHealth(${m.id})">Trash</button>
      </div>
    </div>
  `).join('') || '<p style="text-align:center;color:var(--muted);">No logs yet</p>';
}

function renderProgressView() {
  const dates = state.healthMetrics.map(m => m.date).slice(-30);
  const weights = state.healthMetrics.map(m => m.weight).slice(-30);
  new Chart(document.getElementById('weight-chart'), { type: 'line', data: { labels: dates, datasets: [{ label: 'Weight (lbs)', data: weights, borderColor: '#4ECDC4', fill: false }] } });
}

function saveSettings() {
  state.startDate = document.getElementById('start-date-input').value;
  state.currentWeek = +document.getElementById('current-week-input').value || 1;
  saveData(); calculatePhase(); renderAll(); showToast('Settings saved');
}

function exportData() {
  const data = btoa(JSON.stringify(state));
  const a = document.createElement('a');
  a.href = 'data:application/json;base64,' + data;
  a.download = 'longevity-backup.json';
  a.click();
  showToast('Exported!');
}

function importData(e) {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      state = JSON.parse(atob(ev.target.result));
      saveData(); renderAll(); showToast('Imported!');
    } catch { showToast('Invalid file', true); }
  };
  reader.readAsText(file);
}

function resetAllData() {
  if (confirm('Delete ALL data?')) {
    localStorage.clear();
    location.reload();
  }
}

function showToast(msg, error = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (error ? ' error' : '');
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 2000);
}

function vibrate() {
  if (navigator.vibrate) navigator.vibrate(50);
}

function checkInstall() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('install-banner').style.display = 'flex';
  });
}

window.installApp = () => {
  document.getElementById('install-banner').style.display = 'none';
  deferredPrompt.prompt();
};

window.toggleClearanceBtn = () => {
  document.getElementById('confirm-clearance-btn').disabled = !document.getElementById('clearance-check').checked;
};

window.confirmClearance = () => {
  if (document.getElementById('clearance-check').checked) {
    localStorage.setItem('medical_clearance', 'true');
    document.getElementById('clearance-modal').classList.remove('active');
    showToast('Welcome! Protocol started.');
  }
};

function checkClearance() {
  if (!localStorage.getItem('medical_clearance') && state.currentWeek <= 4) {
    document.getElementById('clearance-modal').classList.add('active');
  }
}

function resetHabitsIfNewDay() {
  const today = new Date().toISOString().split('T')[0];
  const last = localStorage.getItem('last_habit_reset');
  if (last !== today) {
    state.habits.forEach(h => h.completed = false);
    localStorage.setItem('last_habit_reset', today);
    saveData();
  }
}

function checkMidnight() {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) resetHabitsIfNewDay();
}

function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
}

function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(view + '-view').classList.add('active');
  document.querySelector('.nav-btn.active')?.classList.remove('active');
  document.querySelector(`[data-view="${view}"]`).classList.add('active');
  if (view === 'progress') setTimeout(renderProgressView, 100);
  if (view === 'health') renderHealthView();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

function calculatePhase() {
  const week = state.currentWeek;
  let phase = 'PHASE_ZERO';
  if (week > 4 && week <= 16) phase = 'FOUNDATION';
  else if (week <= 28) phase = 'STRENGTH';
  else if (week <= 36) phase = 'HYPERTROPHY';
  else phase = 'INTEGRATION';
  document.getElementById('current-phase-name').textContent = PHASES[phase];
}

const PHASES = { PHASE_ZERO: 'Phase Zero', FOUNDATION: 'Foundation', STRENGTH: 'Strength', HYPERTROPHY: 'Hypertrophy', INTEGRATION: 'Integration' };
const DEFAULT_HABITS = [
  { id: 'sleep', name: '7+ Hours Sleep', icon: 'Moon', completed: false },
  { id: 'water', name: '2L+ Water', icon: 'Droplet', completed: false },
  { id: 'smoke', name: 'No Smoking', icon: 'No Smoking', completed: false },
  { id: 'alcohol', name: 'No Alcohol', icon: 'No Alcohol', completed: false }
];