/**
 * Suggest page — feature suggestions with upvotes
 * Refactored with persistent shell – no flicker.
 */
import { getState, showToast } from '../store.js';
import { db, arrayUnion, arrayRemove } from '../firebase.js';
import { collection, getDocs, addDoc, doc, query, orderBy, runTransaction } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { initBugReport } from '../page-common.js';
import { guardAuth } from './shared.js';
import { pageEl } from '../utils.js';
import { detectCurrentPageKey, onPageEnter, registerPageSubscription, registerPageCleanup } from '../router.js';
import { createPageShell } from '../utils/page-shell.js';

let suggestions = [];
let loading = true;

// 🔥 Persistent shell & fetch locks
let _mounted = false;
let _fetching = false;
let pageShell = null;

function el(id) { return pageEl(id); }
function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function renderList() {
  const container = el('suggest-dynamic-content');
  if (!container) return;

  if (loading) {
    container.innerHTML = '<div class="page-skeleton"></div><div class="page-skeleton"></div>';
    return;
  }

  const { user } = getState();
  const listBuffer = document.createElement('div');

  if (!suggestions.length) {
    listBuffer.innerHTML = '<div class="page-empty card">No suggestions yet. Be the first to share an idea!</div>';
  } else {
    listBuffer.innerHTML = suggestions.map(s => {
      const hasUpvoted = user && s.upvotedBy?.includes(user.uid);
      return `<div class="card list-item" style="display:flex;gap:1rem;align-items:flex-start;cursor:default">
        <div style="flex:1">
          <h3 style="font-size:var(--text-sm);font-weight:800;margin:0 0 0.25rem">${esc(s.title)}</h3>
          <p style="font-size:var(--text-xs);color:var(--text-secondary);margin:0">${esc(s.text)}</p>
          <div style="font-size:0.625rem;color:var(--text-muted);margin-top:0.5rem">By ${esc(s.userName)} • ${new Date(s.createdAt).toLocaleDateString()}</div>
        </div>
        <button class="story-btn${hasUpvoted ? ' active' : ''}" data-upvote="${s.id}" style="min-width:3rem;display:flex;flex-direction:column;align-items:center">▲<span>${s.upvotes || 0}</span></button>
      </div>`;
    }).join('');
  }

  listBuffer.querySelectorAll('[data-upvote]').forEach(btn => {
    btn.addEventListener('click', () => handleUpvote(btn.dataset.upvote));
  });

  container.replaceChildren(...listBuffer.childNodes);
}

async function fetchSuggestions() {
  if (_fetching) return;
  _fetching = true;

  loading = true;
  renderList();
  try {
    const snap = await getDocs(query(collection(db, 'suggestions'), orderBy('upvotes', 'desc')));
    suggestions = [];
    snap.forEach(d => suggestions.push({ id: d.id, ...d.data() }));
  } catch (err) { console.warn(err); }
  loading = false;
  const countEl = el('suggest-count');
  if (countEl) countEl.textContent = String(suggestions.length);
  renderList();
  _fetching = false;
}

async function handleSubmit(e) {
  e.preventDefault();
  const { user, userData } = getState();
  const titleTrim = el('sugg-title')?.value.trim() || '';
  const contentTrim = el('sugg-content')?.value.trim() || '';
  if (!titleTrim || !contentTrim) { showToast('All fields are required.', 'warning'); return; }
  
  const submitBtn = el('sugg-submit');
  if (submitBtn) submitBtn.disabled = true;
  
  try {
    const docRef = await addDoc(collection(db, 'suggestions'), {
      title: titleTrim, text: contentTrim, userId: user.uid, userName: userData?.name || 'Anonymous',
      status: 'pending', upvotes: 1, upvotedBy: [user.uid], createdAt: new Date().toISOString(),
    });
    suggestions = [{ id: docRef.id, title: titleTrim, text: contentTrim, userId: user.uid, userName: userData?.name || 'Anonymous', status: 'pending', upvotes: 1, upvotedBy: [user.uid], createdAt: new Date().toISOString() }, ...suggestions].sort((a, b) => b.upvotes - a.upvotes);
    
    const titleInput = el('sugg-title');
    const contentInput = el('sugg-content');
    if (titleInput) titleInput.value = '';
    if (contentInput) contentInput.value = '';
    
    showToast('✅ Feature suggestion submitted!', 'success');
    const countEl = el('suggest-count');
    if (countEl) countEl.textContent = String(suggestions.length);
    renderList();
  } catch (err) { showToast(`❌ Submission failed: ${err.message}`, 'error'); }
  finally { 
    if (submitBtn) submitBtn.disabled = false; 
  }
}

async function handleUpvote(suggId) {
  const { user } = getState();
  if (!user) { showToast('Please log in to vote.', 'warning'); return; }
  const sugg = suggestions.find(s => s.id === suggId);
  if (!sugg) return;
  const hasUpvoted = sugg.upvotedBy?.includes(user.uid);
  
  // 1. Instantly perform a targeted, in-place DOM update (highly responsive, no flash)
  const btn = document.querySelector(`button[data-upvote="${CSS.escape(suggId)}"]`);
  if (btn) {
    const nextUpvotes = hasUpvoted ? Math.max((sugg.upvotes || 0) - 1, 0) : (sugg.upvotes || 0) + 1;
    btn.classList.toggle('active', !hasUpvoted);
    const countSpan = btn.querySelector('span');
    if (countSpan) countSpan.textContent = String(nextUpvotes);
  }

  // 2. Update local state
  suggestions = suggestions.map(s => {
    if (s.id !== suggId) return s;
    const upvotedBy = hasUpvoted ? s.upvotedBy.filter(u => u !== user.uid) : [...(s.upvotedBy || []), user.uid];
    return { ...s, upvotes: upvotedBy.length, upvotedBy };
  });

  try {
    await runTransaction(db, async (transaction) => {
      const ref = doc(db, 'suggestions', suggId);
      const snap = await transaction.get(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const voters = data.upvotedBy || [];
      if (voters.includes(user.uid)) {
        transaction.update(ref, { upvotedBy: arrayRemove(user.uid), upvotes: Math.max((data.upvotes || 0) - 1, 0) });
      } else {
        transaction.update(ref, { upvotedBy: arrayUnion(user.uid), upvotes: (data.upvotes || 0) + 1 });
      }
    });
  } catch (err) {
    console.warn(err);
    // Revert local state and DOM if error occurs
    suggestions = suggestions.map(s => {
      if (s.id !== suggId) return s;
      return sugg;
    });
    if (btn) {
      btn.classList.toggle('active', hasUpvoted);
      const countSpan = btn.querySelector('span');
      if (countSpan) countSpan.textContent = String(sugg.upvotes || 0);
    }
  }
}

function init() {
  if (_mounted) return;
  _mounted = true;

  registerPageCleanup(() => {
    _mounted = false;
    _fetching = false;
    pageShell = null;
  });

  // Build persistent shell
  if (!pageShell) {
    pageShell = createPageShell('suggest-root', `
      <div class="page-header">
        <h1>💡 ${t('suggest_heading', 'Feature Suggestions')}</h1>
        <p>${t('suggest_subtitle', 'Suggest features you\'d love to see or upvote ideas from other captains!')}</p>
      </div>
      
      <form class="card" id="suggest-form">
        <h2 style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;margin:0 0 1rem;padding-bottom:0.5rem;border-bottom:1px solid var(--color-border)">${t('suggest_new', 'Suggest a New Feature')}</h2>
        <label class="label" for="sugg-title">${t('suggest_title', 'Title')}</label>
        <input type="text" id="sugg-title" class="input" required placeholder="${t('suggest_title_placeholder', 'e.g. Dark Mode toggle in navigation bar')}">
        <label class="label" for="sugg-content" style="margin-top:0.75rem">${t('suggest_description', 'Description')}</label>
        <textarea id="sugg-content" class="textarea" rows="3" required placeholder="${t('suggest_text_placeholder', 'Tell us why this is awesome...')}"></textarea>
        <button type="submit" class="btn btn--primary" id="sugg-submit" style="width:100%;margin-top:0.75rem">🚀 ${t('suggest_submit', 'Submit Idea')}</button>
      </form>
      
      <section style="margin-top:var(--space-lg)">
        <h2 style="font-size:var(--text-sm);font-weight:700;border-bottom:1px solid var(--color-border);padding-bottom:0.5rem">${t('suggest_list_title', 'Captains\' Ideas')} (<span id="suggest-count">0</span>)</h2>
        <div id="suggest-dynamic-content"></div>
      </section>
    `);
  }

  initBugReport();
  
  // Bind form submit
  const form = el('suggest-form');
  if (form) {
    form.addEventListener('submit', handleSubmit);
  }
  
  // Re-fetch when user changes (to update upvote state)
  const unsub = registerPageSubscription(() => {
    if (detectCurrentPageKey() === 'suggest') {
      fetchSuggestions();
    }
  });
  
  fetchSuggestions();
}

onPageEnter('suggest', init);
