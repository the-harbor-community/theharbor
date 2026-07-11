/**
 * Leaderboard page — top users
 */
import { navigateTo } from '../store.js';
import { db, collection, handleFirestoreError, OperationType } from '../firebase.js';
import { getDocs, query, orderBy, limit, where } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { initBugReport } from '../page-common.js';
import { guardAuth } from './shared.js';
import { registerPageCleanup } from '../router.js';

let activeTab = 'likes';
let leaders = [];
let loading = true;
let refreshInterval = null;

function el(id) { return document.getElementById(id); }
function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function renderTabs() {
  return [['likes', '❤️ Top Loved'], ['gold', '💰 Top Donors'], ['followers', '🌟 Beacon of Hope']].map(([tab, label]) =>
    `<button class="page-tab${activeTab === tab ? ' active' : ''}" data-tab="${tab}">${label}</button>`).join('');
}

function render() {
  const root = el('leaderboard-root');
  if (!root) return;

  // Render shell once to avoid wiping the whole page on interactions
  let listContainer = el('leaderboard-list');
  let tabsContainer = el('leaderboard-tabs');
  if (!listContainer || !tabsContainer) {
    root.innerHTML = `
      <div class="page-header" style="text-align:center">
        <h1>🏆 Community Leaderboards</h1>
        <p>Honoring the voices and supportive hands guiding our Harbor.</p>
      </div>
      <div id="leaderboard-tabs" class="page-tabs" style="justify-content:center;border:none">
        ${renderTabs()}
      </div>
      <div id="leaderboard-list" class="card"></div>
    `;
    listContainer = el('leaderboard-list');
    tabsContainer = el('leaderboard-tabs');
  } else {
    tabsContainer.innerHTML = renderTabs();
  }

  // Render list or loading state within the list container only (targeted update)
  if (loading) {
    listContainer.innerHTML = '<div class="page-skeleton" style="margin: 2rem 0;"></div>';
  } else {
    listContainer.innerHTML = leaders.length ? leaders.map((leader, i) => `
      <div class="list-item" data-uid="${leader.uid}" style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem 0.5rem;border:none;border-radius:var(--radius-lg);margin:0;cursor:pointer">
        <div style="display:flex;align-items:center;gap:0.75rem">
          <span style="width:1.5rem;height:1.5rem;border-radius:var(--radius-full);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:var(--text-xs);${i === 0 ? 'background:#eab308;color:#fff' : i === 1 ? 'background:#a3a3a3;color:#fff' : i === 2 ? 'background:#d97706;color:#fff' : 'border:1px solid var(--color-border);color:var(--text-muted)'}">${i + 1}</span>
          <span style="font-size:1.25rem">${leader.avatar || '👤'}</span>
          <div>
            <span style="font-weight:800;font-size:var(--text-sm);display:block">${esc(leader.name)}</span>
            <span style="font-size:0.625rem;color:var(--text-muted)">📍 ${esc(leader.country || 'International')}</span>
          </div>
        </div>
        <span style="font-weight:900;font-size:var(--text-xs)">${activeTab === 'likes' ? `❤️ ${leader.likesReceived || 0}` : activeTab === 'gold' ? `🪙 ${leader.goldGiven || 0}` : `🪙 ${leader.goldReceived || 0}`}</span>
      </div>`).join('') : '<div class="page-empty">No leaderboard entries yet.</div>';

    // Bind row click events for targeted elements
    document.querySelectorAll('[data-uid]').forEach(row => row.addEventListener('click', () => navigateTo('profile', { uid: row.dataset.uid })));
  }

  // Bind tab click events without wiping full-frame
  document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (activeTab === tab) return;
    activeTab = tab;
    // Visually toggle active tab state instantly for feedback
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
    fetchLeaders();
  }));
}

async function fetchLeaders(silent = false) {
  let isBackground = false;
  if (leaders.length > 0) {
    loading = false;
    isBackground = true;
    render();
  } else if (!silent) {
    loading = true;
    render();
  }
  const sortingField = activeTab === 'likes' ? 'likesReceived' : activeTab === 'gold' ? 'goldGiven' : 'goldReceived';
  const path = 'users';
  try {
    const snap = await getDocs(query(
      collection(db, path),
      where('isPublic', '==', true),
      where(sortingField, '>', 0),
      orderBy(sortingField, 'desc'),
      limit(20)
    ));
    leaders = [];
    snap.forEach(d => leaders.push({ uid: d.id, id: d.id, ...d.data() }));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
  loading = false;
  render();
}

function cleanup() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

function init() {
  initBugReport();
  fetchLeaders();
  cleanup();
  registerPageCleanup(cleanup);
}
guardAuth(init, 'leaderboard');

