/**
 * Leaderboard page — top users
 * Refactored with persistent shell – no flicker.
 */
import { navigateTo } from '../store.js';
import { db, collection, handleFirestoreError, OperationType } from '../firebase.js';
import { getDocs, query, orderBy, limit, where } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { initBugReport } from '../page-common.js';
import { guardAuth } from './shared.js';
import { registerPageCleanup, onPageEnter, detectCurrentPageKey } from '../router.js';
import { createPageShell } from '../utils/page-shell.js';

let activeTab = 'likes';
let leaders = [];
let loading = true;
let refreshInterval = null;

// 🔥 Persistent shell & fetch locks
let _mounted = false;
let _fetching = false;
let pageShell = null;

function el(id) { return document.getElementById(id); }
function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function renderTabs() {
  return [['likes', '❤️ Top Loved'], ['gold', '💰 Top Donors'], ['followers', '🌟 Beacon of Hope']].map(([tab, label]) =>
    `<button class="page-tab${activeTab === tab ? ' active' : ''}" data-tab="${tab}">${label}</button>`).join('');
}

function render() {
  const container = el('leaderboard-dynamic-content');
  if (!container) return;

  // Update tabs
  const tabsContainer = el('leaderboard-tabs');
  if (tabsContainer) {
    const tabsBuffer = document.createElement('div');
    tabsBuffer.innerHTML = renderTabs();
    tabsContainer.replaceChildren(...tabsBuffer.childNodes);
  }

  const listBuffer = document.createElement('div');

  // Render list or loading state
  if (loading) {
    listBuffer.innerHTML = '<div class="page-skeleton" style="margin: 2rem 0;"></div>';
  } else {
    listBuffer.innerHTML = leaders.length ? leaders.map((leader, i) => `
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

    // Bind row click events
    listBuffer.querySelectorAll('[data-uid]').forEach(row => row.addEventListener('click', () => navigateTo('profile', { uid: row.dataset.uid })));
  }

  container.replaceChildren(...listBuffer.childNodes);

  // Bind tab click events
  const tabsContainer2 = el('leaderboard-tabs');
  if (tabsContainer2) {
    tabsContainer2.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (activeTab === tab) return;
        activeTab = tab;
        tabsContainer2.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
        fetchLeaders();
      });
    });
  }
}

async function fetchLeaders(silent = false) {
  if (_fetching) return;
  _fetching = true;

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
  _fetching = false;
}

function cleanup() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

function init() {
  if (_mounted) return;
  _mounted = true;

  // Build persistent shell
  if (!pageShell) {
    pageShell = createPageShell('leaderboard-root', `
      <div class="page-header" style="text-align:center">
        <h1>🏆 Community Leaderboards</h1>
        <p>Honoring the voices and supportive hands guiding our Harbor.</p>
      </div>
      <div id="leaderboard-tabs" class="page-tabs" style="justify-content:center;border:none">
        ${renderTabs()}
      </div>
      <div id="leaderboard-dynamic-content" class="card"></div>
    `);
  }

  initBugReport();
  fetchLeaders();
  cleanup();
  registerPageCleanup(cleanup);
}

onPageEnter('leaderboard', init);
