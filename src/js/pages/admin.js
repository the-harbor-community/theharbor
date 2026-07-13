/**
 * Admin moderation panel
 * Refactored with persistent shell – no flicker.
 */
import { getState, showToast, showConfirm, navigateTo, subscribe } from '../store.js';
import { db, doc, updateDoc, collection, runTransaction } from '../firebase.js';
import { getDocs, query, where, deleteDoc } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { initBugReport } from '../page-common.js';
import { guardAuth } from './shared.js';
import { detectCurrentPageKey, registerPageSubscription, registerPageCleanup, onPageEnter } from '../router.js';
import { createPageShell } from '../utils/page-shell.js';

let reports = [];
let pendingStories = [];
let flaggedReports = [];
let bugs = [];
let pendingDonations = [];
let activeReportTab = 'content';
let loading = true;

// 🔥 Persistent shell & fetch locks
let _mounted = false;
let _fetching = false;
let pageShell = null;

function el(id) { return document.getElementById(id); }
function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function render() {
  const container = el('admin-dynamic-content');
  if (!container) return;

  const root = el('admin-root');
  const { userData } = getState();
  const isAdmin = userData?.isAdmin;

  // If not admin, show access denied
  if (!isAdmin) {
    container.innerHTML = `
      <div class="page-error">⚠️ ${t('admin_access_denied', 'Access Denied')}
        <p style="font-weight:normal;font-size:var(--text-xs);margin:0.5rem 0 1rem">${t('admin_no_privileges', 'You need admin privileges.')}</p>
        <button class="btn btn--primary" id="back-feed">← Back to Feed</button>
      </div>`;
    document.getElementById('back-feed')?.addEventListener('click', () => navigateTo('feed'));
    return;
  }

  // Show loading skeleton
  if (loading) {
    container.innerHTML = '<div class="page-skeleton"></div><div class="page-skeleton"></div>';
    return;
  }

  const contentReports = reports.filter(r => r.type !== 'profile');
  const profileReports = reports.filter(r => r.type === 'profile');
  const filtered = activeReportTab === 'content' ? contentReports : activeReportTab === 'profile' ? profileReports : activeReportTab === 'automod' ? flaggedReports : activeReportTab === 'donations' ? pendingDonations : reports;
  const pendingDonationsCount = pendingDonations.filter(d => d.status === 'pending').length;

  // Build the full content HTML
  container.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem;margin-bottom:var(--space-md)">
      <div>
        <h1 style="font-size:var(--text-xl);font-weight:900;display:flex;align-items:center;gap:0.5rem">👑 Admin Control Panel</h1>
        <p style="font-size:var(--text-xs);color:var(--text-muted)">Review flagged community reports and manage pending stories.</p>
      </div>
      <button class="btn btn--secondary" id="goto-bugs" style="font-size:0.75rem;padding:0.5rem 1rem">
        🐛 Bug Management Console &rarr;
      </button>
    </div>

    <!-- Corporate-Grade Summary Statistics Board -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:var(--space-md);margin-bottom:var(--space-lg)">
      <div class="card" style="padding:var(--space-md);border-left:4px solid var(--color-primary);background:var(--bg-secondary);text-align:center">
        <div style="font-size:0.625rem;font-weight:700;color:var(--text-muted);text-transform:uppercase">Content Flags</div>
        <div style="font-size:1.5rem;font-weight:900;margin-top:0.25rem">${contentReports.length}</div>
      </div>
      <div class="card" style="padding:var(--space-md);border-left:4px solid var(--color-warning);background:var(--bg-secondary);text-align:center">
        <div style="font-size:0.625rem;font-weight:700;color:var(--text-muted);text-transform:uppercase">Profile Flags</div>
        <div style="font-size:1.5rem;font-weight:900;margin-top:0.25rem">${profileReports.length}</div>
      </div>
      <div class="card" style="padding:var(--space-md);border-left:4px solid #8b5cf6;background:var(--bg-secondary);text-align:center">
        <div style="font-size:0.625rem;font-weight:700;color:var(--text-muted);text-transform:uppercase">Intelligence Clusters</div>
        <div style="font-size:1.5rem;font-weight:900;margin-top:0.25rem">${Object.keys(computeClusters().reportClusters).length}</div>
      </div>
      <div class="card" style="padding:var(--space-md);border-left:4px solid var(--color-danger);background:var(--bg-secondary);text-align:center">
        <div style="font-size:0.625rem;font-weight:700;color:var(--text-muted);text-transform:uppercase">Auto-Mod Blocked</div>
        <div style="font-size:1.5rem;font-weight:900;margin-top:0.25rem">${flaggedReports.length}</div>
      </div>
      <div class="card" style="padding:var(--space-md);border-left:4px solid var(--color-success);background:var(--bg-secondary);text-align:center">
        <div style="font-size:0.625rem;font-weight:700;color:var(--text-muted);text-transform:uppercase">Pending Stories</div>
        <div style="font-size:1.5rem;font-weight:900;margin-top:0.25rem">${pendingStories.length}</div>
      </div>
      <div class="card" style="padding:var(--space-md);border-left:4px solid #10b981;background:var(--bg-secondary);text-align:center">
        <div style="font-size:0.625rem;font-weight:700;color:var(--text-muted);text-transform:uppercase">Pending Donations</div>
        <div style="font-size:1.5rem;font-weight:900;margin-top:0.25rem;color:#10b981">${pendingDonationsCount}</div>
      </div>
    </div>

    <section class="card" style="margin-bottom:var(--space-lg);border-radius:var(--radius-lg);padding:var(--space-md)">
      <h2 style="font-size:var(--text-sm);font-weight:700;margin-bottom:var(--space-md);display:flex;align-items:center;gap:0.5rem">🚨 Moderation Queue (${reports.length + flaggedReports.length + pendingDonationsCount})</h2>
      <div class="page-tabs" style="margin-bottom:var(--space-md)">${['content', 'profile', 'intelligence', 'automod', 'donations'].map(tab => `
        <button class="page-tab${activeReportTab === tab ? ' active' : ''}" data-tab="${tab}" style="font-size:0.6875rem;padding:0.375rem 0.75rem">
          ${tab === 'content' ? '📝 Content Flags' : tab === 'profile' ? '👤 Profile Flags' : tab === 'intelligence' ? '🧠 Intelligence Matrix' : tab === 'automod' ? '🤖 Auto-Mod Blocked' : '💰 Donation Approvals'} (${tab === 'content' ? contentReports.length : tab === 'profile' ? profileReports.length : tab === 'intelligence' ? Object.keys(computeClusters().reportClusters).length : tab === 'automod' ? flaggedReports.length : pendingDonationsCount})
        </button>`).join('')}</div>
      <div id="reports-list">
        ${activeReportTab === 'intelligence' ? renderIntelligenceMatrix() : activeReportTab === 'automod' ? renderAutoModReports(flaggedReports) : activeReportTab === 'donations' ? renderDonations() : renderReports(filtered)}
      </div>
    </section>

    <section class="card" style="border-radius:var(--radius-lg);padding:var(--space-md)">
      <h2 style="font-size:var(--text-sm);font-weight:700;margin-bottom:var(--space-md);display:flex;align-items:center;gap:0.5rem">📝 Stories Pending Approval (${pendingStories.length})</h2>
      <div id="pending-list">${renderPending()}</div>
    </section>`;

  // Bind events
  document.getElementById('goto-bugs')?.addEventListener('click', () => navigateTo('admin-bugs'));
  document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => { activeReportTab = btn.dataset.tab; render(); }));
  wireReportButtons();
  wirePendingButtons();
}

function renderReports(list) {
  if (!list.length) return `<div class="page-empty">🎉 Clean sails! No pending ${activeReportTab} reports.</div>`;
  
  return `
    <div style="overflow-x:auto; margin:0 -1rem; padding:0 1rem;">
      <table style="width:100%; border-collapse:collapse; text-align:left; font-size:var(--text-xs)">
        <thead>
          <tr style="border-bottom:1px solid var(--color-border); color:var(--text-muted)">
            <th style="padding:0.75rem; font-weight:700">Report Details</th>
            <th style="padding:0.75rem; font-weight:700">Flagged Target</th>
            <th style="padding:0.75rem; font-weight:700">Reason / Infraction</th>
            <th style="padding:0.75rem; font-weight:700; text-align:right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(r => `
            <tr style="border-bottom:1px solid var(--color-border); vertical-align:middle">
              <td style="padding:0.75rem">
                <div style="font-weight:700; margin-bottom:0.125rem">${esc(r.type)}</div>
                <div style="color:var(--text-muted); font-size:0.625rem">${new Date(r.createdAt).toLocaleDateString()}</div>
              </td>
              <td style="padding:0.75rem">
                ${r.reportedName ? `<div style="font-weight:700">${esc(r.reportedName)}</div>` : ''}
                <div style="color:var(--text-muted); font-size:0.625rem">Reporter: ${esc(r.reporterName)}</div>
              </td>
              <td style="padding:0.75rem; max-width:300px;">
                <div style="font-style:italic; color:var(--color-danger); background:rgba(239,68,68,0.05); padding:0.375rem 0.5rem; border-left:3px solid var(--color-danger); border-radius:var(--radius-sm)">
                  "${esc(r.reason)}"
                </div>
              </td>
              <td style="padding:0.75rem; text-align:right">
                <div style="display:flex; gap:0.25rem; justify-content:flex-end; flex-wrap:wrap">
                  <button class="btn btn--secondary" style="font-size:0.625rem; padding:0.25rem 0.5rem" data-resolve="dismiss" data-id="${r.id}" data-target="${r.reportedId}" data-type="${r.type}">Dismiss</button>
                  <button class="btn btn--danger" style="font-size:0.625rem; padding:0.25rem 0.5rem" data-resolve="delete-content" data-id="${r.id}" data-target="${r.reportedId}" data-type="${r.type}">Delete</button>
                  ${r.type === 'profile' ? `<button class="btn btn--ghost" style="font-size:0.625rem; padding:0.25rem 0.5rem; color:var(--color-danger)" data-resolve="ban" data-id="${r.id}" data-target="${r.reportedId}" data-type="${r.type}">🚫 Ban</button>` : ''}
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderPending() {
  if (!pendingStories.length) return '<div class="page-empty">🌊 All stories approved & published!</div>';
  return `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:var(--space-md)">
      ${pendingStories.map(s => `
        <div class="card" style="padding:var(--space-md); border:1px solid var(--color-border); display:flex; flex-direction:column; justify-content:space-between">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem">
              <span style="font-weight:700; color:var(--color-primary); font-size:var(--text-xs)">Author: ${esc(s.authorName)}</span>
              <span class="badge" style="font-size:0.625rem">${esc(s.category)}</span>
            </div>
            <h3 style="font-size:var(--text-sm); font-weight:700; margin:0 0 0.5rem; color:var(--text-primary)">${esc(s.title)}</h3>
            <p style="font-size:var(--text-xs); white-space:pre-wrap; color:var(--text-muted); line-height:1.4; display:-webkit-box; -webkit-line-clamp:6; -webkit-box-orient:vertical; overflow:hidden; margin-bottom:1rem">"${esc(s.text)}"</p>
          </div>
          <div style="display:flex; gap:0.5rem; padding-top:0.75rem; border-top:1px solid var(--color-border)">
            <button class="btn btn--primary" style="flex:1; font-size:0.6875rem; padding:0.375rem" data-approve="${s.id}">✓ Approve</button>
            <button class="btn btn--danger" style="flex:1; font-size:0.6875rem; padding:0.375rem" data-reject="${s.id}">❌ Reject</button>
          </div>
        </div>`).join('')}
    </div>`;
}

function renderAutoModReports(list) {
  if (!list.length) return `<div class="page-empty">🎉 Clear waters! No auto-moderated content flagged.</div>`;
  return `<div style="display:grid;gap:var(--space-md)">${list.map(r => {
    let previewText = '';
    if (typeof r.content === 'string') {
      previewText = r.content;
    } else if (r.content && typeof r.content === 'object') {
      previewText = r.content.text || r.content.content || JSON.stringify(r.content);
    }
    const displayTitle = r.content?.title ? `<strong>Title:</strong> ${esc(r.content.title)}<br>` : '';
    return `
    <div class="card" style="padding:var(--space-md); border: 1px dashed var(--color-danger)">
      <div style="display:flex;justify-content:space-between;font-size:var(--text-xs);margin-bottom:0.5rem">
        <span class="badge badge--danger" style="background:rgba(239,68,68,0.2);color:var(--color-danger)">🤖 Auto-Blocked (${esc(r.type)})</span>
        <span style="color:var(--text-muted)">${new Date(r.timestamp || Date.now()).toLocaleDateString()}</span>
      </div>
      <div style="font-size:var(--text-xs);margin-bottom:0.5rem"><strong>Blocked User ID:</strong> ${esc(r.userId)}</div>
      <div style="font-size:var(--text-xs);margin-bottom:0.5rem">
        ${displayTitle}
        <strong>Triggered Content:</strong>
        <div style="font-style:italic;background:rgba(239,68,68,0.05);border-left:4px solid var(--color-danger);padding:0.5rem;border-radius:0 var(--radius-lg) var(--radius-lg) 0;margin-top:0.25rem">
          "${esc(previewText)}"
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--color-border)">
        <button class="btn btn--primary" style="font-size:0.625rem;padding:0.25rem 0.75rem" data-automod-approve="${r.id}">✓ Approve (Publish)</button>
        <button class="btn btn--danger" style="font-size:0.625rem;padding:0.25rem 0.75rem" data-automod-delete="${r.id}">🗑️ Delete (Purge)</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function wireReportButtons() {
  document.querySelectorAll('[data-resolve]').forEach(btn => {
    btn.addEventListener('click', () => handleResolveReport(btn.dataset.id, btn.dataset.resolve, btn.dataset.target, btn.dataset.type));
  });
  document.querySelectorAll('[data-automod-approve]').forEach(btn => {
    btn.addEventListener('click', () => handleApproveAutoMod(btn.dataset.automodApprove));
  });
  document.querySelectorAll('[data-automod-delete]').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteAutoMod(btn.dataset.automodDelete));
  });

  document.querySelectorAll('[data-donate-approve]').forEach(btn => {
    btn.addEventListener('click', () => handleApproveDonation(btn.dataset.donateApprove));
  });
  document.querySelectorAll('[data-donate-reject]').forEach(btn => {
    btn.addEventListener('click', () => handleRejectDonation(btn.dataset.donateReject));
  });
  document.querySelectorAll('[data-donate-delete]').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteDonation(btn.dataset.donateDelete));
  });
  
  document.querySelectorAll('[data-batch-dismiss]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.batchDismiss;
      const { reportClusters } = computeClusters();
      handleBatchDismiss(reportClusters[key] || []);
    });
  });

  document.querySelectorAll('[data-batch-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.batchDelete;
      const { reportClusters } = computeClusters();
      handleBatchDelete(reportClusters[key] || []);
    });
  });

  document.querySelectorAll('[data-batch-restrict]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.batchRestrict;
      const { reportClusters } = computeClusters();
      handleBatchBan(reportClusters[key] || []);
    });
  });
}

async function handleApproveAutoMod(reportId) {
  const report = flaggedReports.find(r => r.id === reportId);
  if (!report) return;
  
  showConfirm('✓ Approve Auto-Blocked Content', 'Are you sure you want to approve and publish this content back to production feed?', false, async () => {
    try {
      const { addDoc, collection } = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js');
      
      if (report.type === 'story') {
        const payload = {
          title: report.content?.title || 'Untitled',
          text: report.content?.text || '',
          category: report.content?.category || 'struggles',
          authorId: report.userId,
          userId: report.userId,
          authorName: report.content?.isAnonymous ? 'Anonymous' : 'Friend',
          isAnonymous: report.content?.isAnonymous !== false,
          visibility: report.content?.visibility || 'public',
          approved: true,
          createdAt: new Date().toISOString(),
          reactions: { '❤️': 0, '🙏': 0, '😢': 0, '💪': 0, '🤗': 0 },
          commentCount: 0,
          goldReceived: 0,
          totalGold: 0,
          version: 0,
          editCount: 0,
        };
        await addDoc(collection(db, 'stories'), payload);
      } else if (report.type === 'comment' || report.type === 'comment-reply') {
        const payload = {
          storyId: report.content?.storyId || '',
          text: report.content?.text || '',
          authorId: report.userId,
          userId: report.userId,
          authorName: report.content?.isAnonymous ? 'Anonymous' : 'Friend',
          isAnonymous: report.content?.isAnonymous !== false,
          parentId: report.content?.parentId || null,
          createdAt: new Date().toISOString(),
          likes: [],
          reactions: { '❤️': 0, '🙏': 0, '😢': 0, '💪': 0, '🤗': 0 },
          isPinned: false,
          approved: true,
          replyCount: 0,
        };
        await addDoc(collection(db, 'comments'), payload);
      }
      
      await deleteDoc(doc(db, 'flaggedReports', reportId));
      showToast('✅ Approved and published successfully.', 'success');
      await loadAdminData();
    } catch (err) {
      showToast(`❌ Approval failed: ${err.message}`, 'error');
    }
  });
}

async function handleDeleteAutoMod(reportId) {
  showConfirm('🗑️ Purge Flagged Content', 'Are you sure you want to permanently delete this flagged item?', false, async () => {
    try {
      await deleteDoc(doc(db, 'flaggedReports', reportId));
      showToast('🗑️ Flagged content permanently purged.', 'success');
      await loadAdminData();
    } catch (err) {
      showToast(`❌ Delete failed: ${err.message}`, 'error');
    }
  });
}

function wirePendingButtons() {
  document.querySelectorAll('[data-approve]').forEach(btn => btn.addEventListener('click', () => handleApproveStory(btn.dataset.approve)));
  document.querySelectorAll('[data-reject]').forEach(btn => btn.addEventListener('click', () => {
    showConfirm('⚠️ Delete Pending Story', 'Are you sure you want to reject and delete this story?', false, async () => {
      await deleteDoc(doc(db, 'stories', btn.dataset.reject));
      showToast('Story rejected.', 'success');
      pendingStories = pendingStories.filter(s => s.id !== btn.dataset.reject);
      render();
    });
  }));
}

function handleResolveReport(reportId, decision, targetId, type) {
  showConfirm('⚖️ Confirm Admin Decision', `Are you sure you want to ${decision} on this report?`, false, async () => {
    try {
      await runTransaction(db, async (transaction) => {
        const reportRef = doc(db, 'reports', reportId);
        transaction.update(reportRef, { status: 'resolved', decision, resolvedAt: new Date().toISOString() });
        if (decision === 'delete-content') {
          if (type === 'story') transaction.update(doc(db, 'stories', targetId), { approved: false, visibility: 'private' });
          else if (type === 'comment') transaction.update(doc(db, 'comments', targetId), { approved: false });
          else if (type === 'profile') transaction.update(doc(db, 'users', targetId), { name: 'Flagged Member', bio: 'This bio has been removed for violating community guidelines.', profileBlocked: true });
        } else if (decision === 'dismiss' && type === 'profile') {
          transaction.update(doc(db, 'users', targetId), { profileBlocked: false });
        } else if (decision === 'ban') {
          const reportSnap = await transaction.get(reportRef);
          const actualViolator = type === 'profile' ? targetId : (reportSnap.data()?.reportedBy || 'unknown');
          if (actualViolator !== 'unknown') transaction.update(doc(db, 'users', actualViolator), { isBanned: true });
        }
      });
      showToast('✅ Report resolved.', 'success');
      reports = reports.filter(r => r.id !== reportId);
      render();
    } catch (err) { showToast(`❌ Decision failed: ${err.message}`, 'error'); }
  });
}

async function handleApproveStory(storyId) {
  try {
    await updateDoc(doc(db, 'stories', storyId), { approved: true });
    showToast('✅ Story approved & published!', 'success');
    pendingStories = pendingStories.filter(s => s.id !== storyId);
    render();
  } catch (err) { showToast(`❌ Approval failed: ${err.message}`, 'error'); }
}

function computeClusters() {
  const reportClusters = {};
  reports.forEach(r => {
    const key = r.reportedId || r.reason || 'unknown';
    if (!reportClusters[key]) reportClusters[key] = [];
    reportClusters[key].push(r);
  });

  const bugClusters = {};
  bugs.forEach(b => {
    const cleaned = (b.description || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim().slice(0, 40);
    if (cleaned) {
      if (!bugClusters[cleaned]) bugClusters[cleaned] = [];
      bugClusters[cleaned].push(b);
    }
  });

  return { reportClusters, bugClusters };
}

function detectAnomalies() {
  const anomalies = [];
  
  const reporterCounts = {};
  reports.forEach(r => {
    if (r.reporterId) {
      reporterCounts[r.reporterId] = (reporterCounts[r.reporterId] || 0) + 1;
    }
  });
  
  Object.keys(reporterCounts).forEach(reporterId => {
    if (reporterCounts[reporterId] >= 3) {
      anomalies.push({
        type: 'SPAM BURST DETECTED',
        message: `Reporter ID "${reporterId}" submitted ${reporterCounts[reporterId]} reports. Potential target attack / flood.`
      });
    }
  });

  const { bugClusters } = computeClusters();
  Object.keys(bugClusters).forEach(key => {
    if (bugClusters[key].length >= 3) {
      anomalies.push({
        type: 'DUPLICATE OUTBREAK',
        message: `High volume of similar bug reports (${bugClusters[key].length}) detected regarding similar issue criteria.`
      });
    }
  });

  const profileReports = reports.filter(r => r.type === 'profile');
  const profileCounts = {};
  profileReports.forEach(r => {
    if (r.reportedId) {
      profileCounts[r.reportedId] = (profileCounts[r.reportedId] || 0) + 1;
    }
  });

  Object.keys(profileCounts).forEach(profileId => {
    if (profileCounts[profileId] >= 2) {
      anomalies.push({
        type: 'PROFILE VOLATILITY',
        message: `Profile target ID "${profileId}" has been flagged by ${profileCounts[profileId]} different members. High community rejection.`
      });
    }
  });

  return anomalies;
}

function renderIntelligenceMatrix() {
  const { reportClusters, bugClusters } = computeClusters();
  const anomalies = detectAnomalies();
  
  let anomaliesHtml = '';
  if (anomalies.length > 0) {
    anomaliesHtml = `
      <div style="background:rgba(239,68,68,0.05); border:1px solid rgba(239,68,68,0.2); padding:1rem; border-radius:var(--radius-lg); margin-bottom:var(--space-md)">
        <h3 style="font-size:var(--text-xs); font-weight:800; color:var(--color-danger); text-transform:uppercase; margin-top:0; margin-bottom:0.5rem; display:flex; align-items:center; gap:0.25rem">⚠️ Telemetry Alert Center (Anomaly Detection)</h3>
        <ul style="margin:0; padding-left:1.25rem; font-size:var(--text-xs); color:var(--text-muted); display:grid; gap:0.25rem">
          ${anomalies.map(a => `<li><strong>[${a.type}]</strong> ${esc(a.message)}</li>`).join('')}
        </ul>
      </div>
    `;
  } else {
    anomaliesHtml = `
      <div style="background:rgba(16,185,129,0.05); border:1px solid rgba(16,185,129,0.2); padding:1rem; border-radius:var(--radius-lg); margin-bottom:var(--space-md)">
        <div style="font-size:var(--text-xs); font-weight:800; color:var(--color-success); text-transform:uppercase; display:flex; align-items:center; gap:0.25rem">✓ No system anomalies or bursts detected. Standing by.</div>
      </div>
    `;
  }

  const clusterKeys = Object.keys(reportClusters);
  let clustersHtml = '';
  if (clusterKeys.length === 0) {
    clustersHtml = `<div class="page-empty" style="padding:1.5rem">🎉 No report clusters found. Incoming logs are completely clean!</div>`;
  } else {
    clustersHtml = clusterKeys.map(key => {
      const items = reportClusters[key];
      const firstItem = items[0];
      const isLargeCluster = items.length >= 3;
      const borderStyle = isLargeCluster ? 'border: 2px solid var(--color-danger)' : 'border: 1px solid var(--color-border)';
      const bgStyle = isLargeCluster ? 'background: rgba(239, 68, 68, 0.02)' : 'background: var(--bg-secondary)';
      const targetId = firstItem.reportedId || '';
      const type = firstItem.type || '';
      
      return `
        <div class="card" style="margin-bottom:var(--space-md); ${borderStyle}; ${bgStyle}; padding:var(--space-md); border-radius:var(--radius-lg)">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.75rem">
            <span class="badge ${isLargeCluster ? 'badge--danger' : 'badge--warning'}" style="font-size:0.625rem; text-transform:uppercase">
              ${isLargeCluster ? '🔥 High Density Cluster' : '📁 Active Cluster'} (${items.length} Reports)
            </span>
            <span style="font-size:0.625rem; color:var(--text-muted)">Cluster Target: <code style="font-family:var(--font-mono)">${esc(targetId)}</code> (${esc(type)})</span>
          </div>
          
          <div style="font-size:var(--text-xs); margin-bottom:0.75rem">
            <strong>Flagged content:</strong> "${esc(firstItem.reportedName || 'Unknown Title/Content')}"
          </div>
          
          <div style="max-height: 150px; overflow-y: auto; background: var(--bg-primary); padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); margin-bottom:0.75rem">
            <div style="font-size: 0.625rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.25rem">Individual Complaint Logs:</div>
            <table style="width: 100%; font-size: 0.6875rem">
              <tbody>
                ${items.map(it => `
                  <tr style="border-bottom: 1px solid var(--color-border)">
                    <td style="padding: 0.25rem 0; font-weight:700">${esc(it.reporterName)}:</td>
                    <td style="padding: 0.25rem 0; font-style:italic; color:var(--color-danger)">"${esc(it.reason)}"</td>
                    <td style="padding: 0.25rem 0; text-align:right; color:var(--text-muted)">${new Date(it.createdAt).toLocaleDateString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap; padding-top:0.75rem; border-top:1px solid var(--color-border)">
            <button class="btn btn--secondary" style="font-size:0.625rem; padding:0.25rem 0.5rem" data-batch-dismiss="${key}">⚖️ Batch Dismiss</button>
            <button class="btn btn--danger" style="font-size:0.625rem; padding:0.25rem 0.5rem" data-batch-delete="${key}">🗑️ Group Flag & Purge</button>
            <button class="btn btn--ghost" style="font-size:0.625rem; padding:0.25rem 0.5rem; color:var(--color-danger)" data-batch-restrict="${key}">🚫 Direct Account Restrict</button>
          </div>
        </div>
      `;
    }).join('');
  }

  const bugClusterKeys = Object.keys(bugClusters);
  let bugClustersHtml = '';
  if (bugClusterKeys.length === 0) {
    bugClustersHtml = `<div class="page-empty" style="padding:1.5rem">🎉 No duplicate bug clusters detected. Everything is working correctly!</div>`;
  } else {
    bugClustersHtml = bugClusterKeys.map(key => {
      const items = bugClusters[key];
      const isLarge = items.length >= 2;
      return `
        <div class="card" style="margin-bottom:var(--space-md); border:1px solid var(--color-border); padding:var(--space-md); border-radius:var(--radius-lg); background:var(--bg-secondary)">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem">
            <span class="badge ${isLarge ? 'badge--warning' : 'badge--success'}" style="font-size:0.625rem">
              ${isLarge ? '🐛 Duplicate Bug Cluster' : '🐛 Unique Bug Report'} (${items.length} Reports)
            </span>
            <span style="font-size:0.625rem; color:var(--text-muted)">Matched similarity: "${esc(key)}"</span>
          </div>
          <p style="font-size:var(--text-xs); font-style:italic; margin:0 0 0.5rem">"${esc(items[0].description)}"</p>
          <div style="font-size:0.6875rem; color:var(--text-muted)">
            Reported by: ${items.map(it => esc(it.userName)).join(', ')}
          </div>
        </div>
      `;
    }).join('');
  }

  return `
    <div style="display:grid; gap:var(--space-md)">
      ${anomaliesHtml}
      
      <div style="margin-top:var(--space-xs)">
        <h3 style="font-size:var(--text-xs); font-weight:800; text-transform:uppercase; color:var(--text-muted); margin-bottom:var(--space-sm)">🤖 Group Triage Feed (${clusterKeys.length})</h3>
        ${clustersHtml}
      </div>

      <div style="margin-top:var(--space-md)">
        <h3 style="font-size:var(--text-xs); font-weight:800; text-transform:uppercase; color:var(--text-muted); margin-bottom:var(--space-sm)">🐛 Bug Report Cluster Feed (${bugClusterKeys.length})</h3>
        ${bugClustersHtml}
      </div>
    </div>
  `;
}

async function handleBatchDismiss(clusterItems) {
  if (!clusterItems.length) return;
  showConfirm('⚖️ Batch Dismiss Cluster', `Are you sure you want to dismiss all ${clusterItems.length} reports in this cluster?`, false, async () => {
    try {
      await runTransaction(db, async (transaction) => {
        for (const item of clusterItems) {
          const ref = doc(db, 'reports', item.id);
          transaction.update(ref, { status: 'resolved', decision: 'dismiss', resolvedAt: new Date().toISOString() });
        }
      });
      showToast(`✅ Clustered reports (${clusterItems.length}) dismissed!`, 'success');
      await loadAdminData();
    } catch (err) {
      showToast(`❌ Batch action failed: ${err.message}`, 'error');
    }
  });
}

async function handleBatchDelete(clusterItems) {
  if (!clusterItems.length) return;
  showConfirm('🗑️ Batch Delete Clustered Content', `Are you sure you want to resolve and delete content associated with all ${clusterItems.length} reports in this cluster?`, false, async () => {
    try {
      await runTransaction(db, async (transaction) => {
        for (const item of clusterItems) {
          const ref = doc(db, 'reports', item.id);
          transaction.update(ref, { status: 'resolved', decision: 'delete-content', resolvedAt: new Date().toISOString() });
          if (item.reportedId) {
            if (item.type === 'story') {
              transaction.update(doc(db, 'stories', item.reportedId), { approved: false, visibility: 'private' });
            } else if (item.type === 'comment') {
              transaction.update(doc(db, 'comments', item.reportedId), { approved: false });
            } else if (item.type === 'profile') {
              transaction.update(doc(db, 'users', item.reportedId), { name: 'Flagged Member', bio: 'This bio has been removed for violating community guidelines.', profileBlocked: true });
            }
          }
        }
      });
      showToast(`✅ Clustered content (${clusterItems.length}) processed and deleted!`, 'success');
      await loadAdminData();
    } catch (err) {
      showToast(`❌ Batch action failed: ${err.message}`, 'error');
    }
  });
}

async function handleBatchBan(clusterItems) {
  if (!clusterItems.length) return;
  showConfirm('🚫 Direct Account Restrict', `Are you sure you want to ban accounts associated with all ${clusterItems.length} reports in this cluster?`, false, async () => {
    try {
      await runTransaction(db, async (transaction) => {
        for (const item of clusterItems) {
          const ref = doc(db, 'reports', item.id);
          transaction.update(ref, { status: 'resolved', decision: 'ban', resolvedAt: new Date().toISOString() });
          
          const violator = item.reportedId || item.reportedBy || 'unknown';
          if (violator && violator !== 'unknown') {
            transaction.update(doc(db, 'users', violator), { isBanned: true });
          }
        }
      });
      showToast(`🚫 Accounts restricted for all items in the cluster!`, 'success');
      await loadAdminData();
    } catch (err) {
      showToast(`❌ Bulk restriction failed: ${err.message}`, 'error');
    }
  });
}

function renderDonations() {
  if (!pendingDonations.length) return `<div class="page-empty">🎉 No donations logs found! All clear.</div>`;
  
  return `
    <div style="overflow-x:auto; margin:0 -1rem; padding:0 1rem;">
      <table style="width:100%; border-collapse:collapse; text-align:left; font-size:var(--text-xs)">
        <thead>
          <tr style="border-bottom:1px solid var(--color-border); color:var(--text-muted)">
            <th style="padding:0.75rem; font-weight:700">Member</th>
            <th style="padding:0.75rem; font-weight:700">Amount (USD)</th>
            <th style="padding:0.75rem; font-weight:700">Method</th>
            <th style="padding:0.75rem; font-weight:700">Details</th>
            <th style="padding:0.75rem; font-weight:700">Status</th>
            <th style="padding:0.75rem; font-weight:700; text-align:right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${pendingDonations.map(d => {
            const dateStr = d.timestamp ? new Date(d.timestamp).toLocaleDateString() : 'N/A';
            const isPending = d.status === 'pending';
            const statusBadge = d.status === 'approved' 
              ? '<span class="badge badge--success" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.2);padding:0.125rem 0.375rem;border-radius:9999px;">Approved</span>'
              : d.status === 'rejected'
              ? '<span class="badge badge--danger" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.2);padding:0.125rem 0.375rem;border-radius:9999px;">Rejected</span>'
              : '<span class="badge badge--warning" style="background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.2);padding:0.125rem 0.375rem;border-radius:9999px;">Pending</span>';

            return `
              <tr style="border-bottom:1px solid var(--color-border); vertical-align:middle">
                <td style="padding:0.75rem">
                  <div style="font-weight:700">${esc(d.userName)}</div>
                  <div style="color:var(--text-muted); font-size:0.625rem">${esc(d.userEmail)}</div>
                </td>
                <td style="padding:0.75rem; font-weight:800; color:var(--text-primary)">
                  $${parseFloat(d.amount || 0).toFixed(2)}
                </td>
                <td style="padding:0.75rem">
                  <span style="font-weight:700; color: ${d.method === 'bKash' ? '#e2136e' : '#10b981'}">
                    ${d.method === 'bKash' ? '📱 bKash' : '💳 Payoneer'}
                  </span>
                </td>
                <td style="padding:0.75rem">
                  <div style="font-family:monospace; font-weight:700">${esc(d.trxId)}</div>
                  <div style="color:var(--text-muted); font-size:0.625rem">Sender: ${esc(d.sender)} • ${dateStr}</div>
                </td>
                <td style="padding:0.75rem">
                  ${statusBadge}
                </td>
                <td style="padding:0.75rem; text-align:right">
                  ${isPending ? `
                    <div style="display:inline-flex; gap:0.25rem">
                      <button class="btn btn--primary" style="font-size:0.625rem; padding:0.25rem 0.5rem; background:#10b981; border-color:#10b981; color:#fff;" data-donate-approve="${d.id}">Confirm</button>
                      <button class="btn btn--danger" style="font-size:0.625rem; padding:0.25rem 0.5rem" data-donate-reject="${d.id}">Reject</button>
                    </div>
                  ` : `
                    <button class="btn btn--secondary" style="font-size:0.625rem; padding:0.25rem 0.5rem" data-donate-delete="${d.id}">Purge</button>
                  `}
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

async function handleApproveDonation(id) {
  showConfirm('✓ Approve Donation', 'Are you sure you want to approve this donation? It will update the progress bar on the donate page and add them to the public contributor listings.', false, async () => {
    try {
      await updateDoc(doc(db, 'donations', id), { status: 'approved' });
      showToast('🎉 Donation approved and updated successfully!', 'success');
      await loadAdminData();
    } catch (err) {
      showToast(`❌ Approval failed: ${err.message}`, 'error');
    }
  });
}

async function handleRejectDonation(id) {
  showConfirm('❌ Reject Donation', 'Are you sure you want to reject this donation record?', false, async () => {
    try {
      await updateDoc(doc(db, 'donations', id), { status: 'rejected' });
      showToast('Donation marked as rejected.', 'success');
      await loadAdminData();
    } catch (err) {
      showToast(`❌ Rejection failed: ${err.message}`, 'error');
    }
  });
}

async function handleDeleteDonation(id) {
  showConfirm('🗑️ Purge Donation Record', 'Permanently delete this donation history item?', false, async () => {
    try {
      await deleteDoc(doc(db, 'donations', id));
      showToast('Donation record permanently purged.', 'success');
      await loadAdminData();
    } catch (err) {
      showToast(`❌ Deletion failed: ${err.message}`, 'error');
    }
  });
}

async function loadAdminData() {
  if (_fetching) return;
  _fetching = true;

  const { userData } = getState();
  if (!userData?.isAdmin) { navigateTo('feed'); _fetching = false; return; }
  
  loading = true;
  render();

  try {
    const reportsSnap = await getDocs(query(collection(db, 'reports'), where('status', '==', 'pending')));
    reports = [];
    reportsSnap.forEach(d => reports.push({ id: d.id, ...d.data() }));

    const flaggedSnap = await getDocs(query(collection(db, 'flaggedReports')));
    flaggedReports = [];
    flaggedSnap.forEach(d => flaggedReports.push({ id: d.id, ...d.data() }));

    const pendingSnap = await getDocs(query(collection(db, 'stories'), where('approved', '==', false)));
    pendingStories = [];
    pendingSnap.forEach(d => pendingStories.push({ id: d.id, ...d.data() }));

    const bugsSnap = await getDocs(collection(db, 'bugs'));
    bugs = [];
    bugsSnap.forEach(d => bugs.push({ id: d.id, ...d.data() }));

    const donationsSnap = await getDocs(collection(db, 'donations'));
    pendingDonations = [];
    donationsSnap.forEach(d => pendingDonations.push({ id: d.id, ...d.data() }));
    pendingDonations.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
  } catch (err) { showToast(`❌ Failed to load admin dashboard: ${err.message}`, 'error'); }
  
  loading = false;
  render();
  _fetching = false;
}

function init() {
  if (_mounted) return;
  _mounted = true;

  // Build persistent shell
  if (!pageShell) {
    pageShell = createPageShell('admin-root', `
      <div id="admin-dynamic-content" class="page-content"></div>
    `);
  }

  initBugReport();
  
  const unsub = subscribe('userData', () => {
    if (detectCurrentPageKey() !== 'admin') return;
    if (!getState().userData?.isAdmin && !getState().authLoading) navigateTo('feed');
  });
  registerPageSubscription(unsub);
  
  loadAdminData();
}

onPageEnter('admin', init);
