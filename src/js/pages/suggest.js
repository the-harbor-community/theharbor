/**
 * Suggest page — feature suggestions with upvotes
 */
import { getState, showToast } from '../store.js';
import { db, arrayUnion, arrayRemove } from '../firebase.js';
import { collection, getDocs, addDoc, doc, query, orderBy, runTransaction } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { initBugReport } from '../page-common.js';
import { guardAuth } from './shared.js';
import { pageEl } from '../utils.js';
import { detectCurrentPageKey } from '../router.js';

let suggestions = [];
let loading = true;

function el(id) { return pageEl(id); }
function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function renderList() {
  const list = el('suggestions-list');
  if (!list) return;
  if (loading) { list.innerHTML = '<div class="page-skeleton"></div><div class="page-skeleton"></div>'; return; }
  const { user } = getState();
  if (!suggestions.length) {
    list.innerHTML = '<div class="page-empty card">No suggestions yet. Be the first to share an idea!</div>';
    return;
  }
  list.innerHTML = suggestions.map(s => {
    const hasUpvoted = user && s.upvotedBy?.includes(user.uid);
    return `<div class="card list-item" style="display:flex;gap:1rem;align-items:flex-start;cursor:default">
      <div style="flex:1"><h3 style="font-size:var(--text-sm);font-weight:800;margin:0 0 0.25rem">${esc(s.title)}</h3>
        <p style="font-size:var(--text-xs);color:var(--text-secondary);margin:0">${esc(s.text)}</p>
        <div style="font-size:0.625rem;color:var(--text-muted);margin-top:0.5rem">By ${esc(s.userName)} • ${new Date(s.createdAt).toLocaleDateString()}</div></div>
      <button class="story-btn${hasUpvoted ? ' active' : ''}" data-upvote="${s.id}" style="min-width:3rem;display:flex;flex-direction:column;align-items:center">▲<span>${s.upvotes || 0}</span></button></div>`;
  }).join('');
  list.querySelectorAll('[data-upvote]').forEach(btn => btn.addEventListener('click', () => handleUpvote(btn.dataset.upvote)));
}

async function fetchSuggestions() {
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
}

async function handleSubmit(e) {
  e.preventDefault();
  const { user, userData } = getState();
  const titleTrim = el('sugg-title').value.trim();
  const contentTrim = el('sugg-content').value.trim();
  if (!titleTrim || !contentTrim) { showToast('All fields are required.', 'warning'); return; }
  el('sugg-submit').disabled = true;
  try {
    const docRef = await addDoc(collection(db, 'suggestions'), {
      title: titleTrim, text: contentTrim, userId: user.uid, userName: userData?.name || 'Anonymous',
      status: 'pending', upvotes: 1, upvotedBy: [user.uid], createdAt: new Date().toISOString(),
    });
    suggestions = [{ id: docRef.id, title: titleTrim, text: contentTrim, userId: user.uid, userName: userData?.name || 'Anonymous', status: 'pending', upvotes: 1, upvotedBy: [user.uid], createdAt: new Date().toISOString() }, ...suggestions].sort((a, b) => b.upvotes - a.upvotes);
    el('sugg-title').value = '';
    el('sugg-content').value = '';
    showToast('✅ Feature suggestion submitted!', 'success');
    const countEl = el('suggest-count');
    if (countEl) countEl.textContent = String(suggestions.length);
    renderList();
  } catch (err) { showToast(`❌ Submission failed: ${err.message}`, 'error'); }
  finally { el('sugg-submit').disabled = false; }
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
  initBugReport();
  el('suggest-form')?.addEventListener('submit', handleSubmit);
  fetchSuggestions();
}

guardAuth(init, 'suggest');
