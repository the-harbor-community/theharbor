/**
 * Admin bugs page — bug management & public changelog
 */
import { getState, showToast, showConfirm, navigateTo } from '../store.js';
import { db, doc, updateDoc, collection, runTransaction } from '../firebase.js';
import { getDocs, getDoc } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { initBugReport } from '../page-common.js';
import { guardAuth } from './shared.js';

let bugs = [];
let notes = {};
let loading = true;

function el(id) { return document.getElementById(id); }
function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function render() {
  const { userData } = getState();
  const isAdmin = userData?.isAdmin;
  const visible = isAdmin ? bugs : bugs.filter(b => b.published);
  const root = el('bugs-root');

  if (loading) { root.innerHTML = '<div class="page-skeleton"></div><div class="page-skeleton"></div>'; return; }

  const pendingCount = bugs.filter(b => b.status === 'pending').length;
  const inProgressCount = bugs.filter(b => b.status === 'in-progress').length;
  const resolvedCount = bugs.filter(b => b.status === 'resolved').length;

  const statsHtml = isAdmin ? `
    <!-- Real-Time Bug Metrics Board -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:var(--space-md);margin-bottom:var(--space-lg)">
      <div class="card" style="padding:var(--space-sm) var(--space-md);border-left:4px solid var(--color-danger);background:var(--bg-secondary);text-align:center">
        <div style="font-size:0.625rem;font-weight:700;color:var(--text-muted);text-transform:uppercase">Pending</div>
        <div style="font-size:1.25rem;font-weight:900;margin-top:0.25rem">${pendingCount}</div>
      </div>
      <div class="card" style="padding:var(--space-sm) var(--space-md);border-left:4px solid var(--color-warning);background:var(--bg-secondary);text-align:center">
        <div style="font-size:0.625rem;font-weight:700;color:var(--text-muted);text-transform:uppercase">In Progress</div>
        <div style="font-size:1.25rem;font-weight:900;margin-top:0.25rem">${inProgressCount}</div>
      </div>
      <div class="card" style="padding:var(--space-sm) var(--space-md);border-left:4px solid var(--color-success);background:var(--bg-secondary);text-align:center">
        <div style="font-size:0.625rem;font-weight:700;color:var(--text-muted);text-transform:uppercase">Resolved</div>
        <div style="font-size:1.25rem;font-weight:900;margin-top:0.25rem">${resolvedCount}</div>
      </div>
      <div class="card" style="padding:var(--space-sm) var(--space-md);border-left:4px solid var(--color-primary);background:var(--bg-secondary);text-align:center">
        <div style="font-size:0.625rem;font-weight:700;color:var(--text-muted);text-transform:uppercase">Total Logged</div>
        <div style="font-size:1.25rem;font-weight:900;margin-top:0.25rem">${bugs.length}</div>
      </div>
    </div>
  ` : '';

  root.innerHTML = `
    <button class="page-back" id="back-btn">${isAdmin ? '← Back to Admin Control' : '← Back to Feed'}</button>
    <div class="page-header" style="margin-bottom:var(--space-md)">
      <h1 style="font-size:var(--text-xl);font-weight:900;display:flex;align-items:center;gap:0.5rem">
        ${isAdmin ? '🐛 Bug Management Console' : '🔧 Community Bug Fixes'}
      </h1>
      <p style="font-size:var(--text-xs);color:var(--text-muted)">
        ${isAdmin ? 'Review user-submitted bug logs and publish changelog fixes.' : 'Review resolved issue reports and official changelogs.'}
      </p>
    </div>

    ${statsHtml}

    <div style="display:grid;gap:var(--space-md)">
      ${visible.length ? visible.map(b => renderBugCard(b, isAdmin)).join('') : '<div class="page-empty card">⛵ No reported bug logs found.</div>'}
    </div>`;

  el('back-btn').addEventListener('click', () => navigateTo(isAdmin ? 'admin' : 'feed'));
  if (isAdmin) wireAdminActions();
}

function renderBugCard(b, isAdmin) {
  const priCls = b.priority === 'high' ? 'badge--danger' : b.priority === 'medium' ? 'badge--warning' : 'badge--success';
  const statusCls = b.status === 'resolved' ? 'badge--success' : b.status === 'in-progress' ? 'badge--warning' : '';
  return `<div class="card" style="margin-bottom:var(--space-md)">
    <div style="display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:space-between;font-size:var(--text-xs);margin-bottom:0.5rem">
      <div style="display:flex;gap:0.5rem"><span class="badge ${priCls}">${b.priority || 'low'} priority</span>
        <span class="badge ${statusCls}">${b.status}</span></div>
      <span style="color:var(--text-muted)">${new Date(b.createdAt).toLocaleDateString()}</span></div>
    ${isAdmin ? `<div style="font-size:var(--text-xs);font-weight:700;margin-bottom:0.5rem">Reported by: <span style="color:var(--color-primary)">${esc(b.userName)}</span> (${esc(b.userEmail)})</div>` : ''}
    <p style="font-size:var(--text-xs);font-style:italic;background:var(--bg-secondary);padding:0.75rem;border-radius:var(--radius-lg);border:1px solid var(--color-border);margin:0 0 0.75rem">"${esc(b.description)}"</p>
    ${isAdmin ? `<label class="label">Admin Notes / Fix Description</label>
      <textarea class="textarea" rows="2" data-notes="${b.id}" placeholder="Describe the solution...">${esc(notes[b.id] || '')}</textarea>
      <div style="display:flex;flex-wrap:gap:0.5rem;margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--color-border)">
        <button class="btn btn--secondary" style="font-size:0.625rem" data-status="pending" data-id="${b.id}">Pending</button>
        <button class="btn btn--secondary" style="font-size:0.625rem" data-status="in-progress" data-id="${b.id}">In Progress</button>
        <button class="btn btn--primary" style="font-size:0.625rem" data-status="resolved" data-id="${b.id}">Resolved</button>
        <button class="btn btn--danger" style="font-size:0.625rem;background:var(--color-danger);border:none;color:white" data-delete-bug="${b.id}">🗑️ Delete Bug</button>
        <button class="btn btn--ghost" style="font-size:0.625rem;margin-left:auto" data-save="${b.id}">💾 Save Notes</button>
        ${b.status === 'resolved' && !b.published ? `<button class="btn btn--primary" style="font-size:0.625rem" data-publish="${b.id}">📣 Publish Bug Fix</button>` : ''}
        ${b.published ? '<span style="font-size:0.625rem;color:var(--color-success);font-weight:700">✓ Published to public log</span>' : ''}
      </div>` : (b.adminNotes ? `<div style="background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.15);padding:0.75rem;border-radius:var(--radius-lg)">
        <div style="font-size:0.625rem;font-weight:700;color:var(--color-success);text-transform:uppercase">Official Fix Log</div>
        <p style="font-size:var(--text-xs);margin:0.25rem 0 0">${esc(b.adminNotes)}</p></div>` : '')}
  </div>`;
}

function wireAdminActions() {
  document.querySelectorAll('[data-notes]').forEach(ta => {
    ta.addEventListener('input', () => { notes[ta.dataset.notes] = ta.value; });
  });
  document.querySelectorAll('[data-status]').forEach(btn => btn.addEventListener('click', () => handleUpdateStatus(btn.dataset.id, btn.dataset.status)));
  document.querySelectorAll('[data-save]').forEach(btn => btn.addEventListener('click', () => handleSaveNotes(btn.dataset.save)));
  document.querySelectorAll('[data-publish]').forEach(btn => btn.addEventListener('click', () => handlePublishFix(bugs.find(b => b.id === btn.dataset.publish))));
  document.querySelectorAll('[data-delete-bug]').forEach(btn => btn.addEventListener('click', () => handleDeleteBug(btn.dataset.deleteBug)));
}

async function handleDeleteBug(bugId) {
  showConfirm('🗑️ Delete Bug Entry?', 'Are you sure you want to permanently delete this bug log? This action is destructive and cannot be undone.', false, async () => {
    try {
      await runTransaction(db, async (transaction) => {
        const bugRef = doc(db, 'bugs', bugId);
        transaction.delete(bugRef);
      });
      bugs = bugs.filter(b => b.id !== bugId);
      showToast('🗑️ Bug log permanently deleted!', 'success');
      render();
    } catch (err) {
      showToast(`❌ Deletion failed: ${err.message}`, 'error');
    }
  });
}

async function handleUpdateStatus(bugId, status) {
  try {
    if (status === 'resolved') {
      const bugRef = doc(db, 'bugs', bugId);
      const bugSnap = await getDoc(bugRef);
      const bugData = bugSnap.exists() ? bugSnap.data() : null;
      await runTransaction(db, async (transaction) => {
        transaction.update(bugRef, { status, updatedAt: new Date().toISOString() });
        transaction.set(doc(collection(db, 'bug-fix')), { bugId, description: bugData?.description || 'Bug resolved by admin', status: 'resolved', resolvedAt: new Date().toISOString() });
      });
    } else {
      await updateDoc(doc(db, 'bugs', bugId), { status, updatedAt: new Date().toISOString() });
    }
    bugs = bugs.map(b => b.id === bugId ? { ...b, status } : b);
    showToast(`✅ Bug status updated to ${status}!`, 'success');
    render();
  } catch (err) { showToast(`❌ Status update failed: ${err.message}`, 'error'); }
}

async function handleSaveNotes(bugId) {
  const txt = notes[bugId]?.trim() || '';
  try {
    await updateDoc(doc(db, 'bugs', bugId), { adminNotes: txt, updatedAt: new Date().toISOString() });
    bugs = bugs.map(b => b.id === bugId ? { ...b, adminNotes: txt } : b);
    showToast('✅ Admin notes saved!', 'success');
  } catch (err) { showToast(`❌ Save failed: ${err.message}`, 'error'); }
}

function handlePublishFix(bug) {
  const fixNotes = notes[bug.id]?.trim() || '';
  if (!fixNotes) { showToast('⚠️ Please write admin notes describing the fix before publishing.', 'warning'); return; }
  showConfirm('📣 Publish Bug Fix Log', 'Publish this resolved bug fix to the public changelog?', false, () => {
    (async () => {
      try {
        await runTransaction(db, async (transaction) => {
          transaction.update(doc(db, 'bugs', bug.id), { published: true, publishedAt: new Date().toISOString(), status: 'resolved', adminNotes: fixNotes });
          transaction.set(doc(collection(db, 'bugFixes')), { bugId: bug.id, description: bug.description, status: 'fixed', adminNotes: fixNotes, publishedAt: new Date().toISOString() });
          transaction.set(doc(collection(db, 'bug-fix')), { bugId: bug.id, description: bug.description, adminNotes: fixNotes, status: 'resolved', resolvedAt: new Date().toISOString() });
        });
        bugs = bugs.map(b => b.id === bug.id ? { ...b, published: true, status: 'resolved', adminNotes: fixNotes } : b);
        showToast('🎉 Bug fix published to public log!', 'success');
        render();
      } catch (err) { showToast(`❌ Publishing failed: ${err.message}`, 'error'); }
    })().catch((err) => showToast(`❌ Publishing failed: ${err.message}`, 'error'));
  });
}

async function loadBugs() {
  loading = true;
  render();
  try {
    const snap = await getDocs(collection(db, 'bugs'));
    bugs = [];
    notes = {};
    snap.forEach(d => { const data = d.data(); bugs.push({ id: d.id, ...data }); notes[d.id] = data.adminNotes || ''; });
  } catch (err) { showToast(`❌ Failed to load bugs: ${err.message}`, 'error'); }
  loading = false;
  render();
}

function init() {
  initBugReport();
  const { user } = getState();
  if (user) localStorage.setItem(`last_viewed_bug_fix_${user.uid}`, new Date().toISOString());
  loadBugs();
}

guardAuth(init, 'admin-bugs');
