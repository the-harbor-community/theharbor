/**
 * Transactions page — displays Harbor Gold sent and received ledger
 * Refactored with persistent shell – no flicker.
 */
import { getState, showToast, navigateTo, subscribe, t } from '../store.js';
import { registerPageSubscription, registerPageCleanup, detectCurrentPageKey, onPageEnter } from '../router.js';
import { db, collection } from '../firebase.js';
import { getDocs, query, where } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { initBugReport } from '../page-common.js';
import { guardAuth } from './shared.js';
import { createPageShell } from '../utils/page-shell.js';

let transactions = [];
let loading = true;

// 🔥 Persistent shell & fetch locks
let _mounted = false;
let _fetching = false;
let pageShell = null;

function el(id) { return document.getElementById(id); }
function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function render() {
  const root = el('transactions-root');
  if (!root) return;

  const container = el('transactions-dynamic-content');
  if (!container) return;

  if (loading) {
    container.innerHTML = `
      <div class="page-skeleton" style="margin-bottom:var(--space-md)"></div>
      <div class="page-skeleton" style="margin-bottom:var(--space-md)"></div>
    `;
    return;
  }

  if (transactions.length === 0) {
    container.innerHTML = `
      <div class="page-empty card" style="text-align: center; padding: var(--space-xl); color: var(--text-muted);">
        <span style="font-size: 3rem; display: block; margin-bottom: var(--space-sm);">🪙</span>
        <h3 style="margin: 0; font-weight: 700; color: var(--text-primary);">${t('no_transactions_yet', 'No transaction history.')}</h3>
        <p style="font-size: var(--text-xs); margin: 0.5rem 0 0; color: var(--text-secondary);">
          You haven't sent or received any Harbor Gold yet.
        </p>
      </div>
    `;
    return;
  }

  const { user } = getState();

  container.innerHTML = `
    <div style="overflow-x:auto; margin:0 -1rem; padding:0 1rem;">
      <table style="width:100%; border-collapse:collapse; text-align:left; font-size:var(--text-xs)">
        <thead>
          <tr style="border-bottom:1px solid var(--color-border); color:var(--text-muted)">
            <th style="padding:0.75rem; font-weight:700">Type</th>
            <th style="padding:0.75rem; font-weight:700">Participant</th>
            <th style="padding:0.75rem; font-weight:700">Message / Story ID</th>
            <th style="padding:0.75rem; font-weight:700; text-align:right">Amount</th>
            <th style="padding:0.75rem; font-weight:700; text-align:right">Date</th>
          </tr>
        </thead>
        <tbody>
          ${transactions.map(tx => {
            const isReceived = tx.toUid === user?.uid;
            const typeLabel = isReceived ? '🟢 Received' : '🔴 Sent';
            const participant = isReceived ? (tx.fromName || 'Someone') : (tx.toName || 'Someone');
            const message = tx.message ? `"${esc(tx.message)}"` : (tx.storyId ? `<span style="color:var(--text-muted)">Story donation</span>` : 'Support donation');

            return `
              <tr class="list-item" data-story-id="${tx.storyId || ''}" style="border-bottom:1px solid var(--color-border); vertical-align:middle; cursor:${tx.storyId ? 'pointer' : 'default'}">
                <td style="padding:0.75rem">
                  <span class="badge ${isReceived ? 'badge--success' : 'badge--warning'}">${typeLabel}</span>
                </td>
                <td style="padding:0.75rem; font-weight:700">${esc(participant)}</td>
                <td style="padding:0.75rem; max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${message}</td>
                <td style="padding:0.75rem; text-align:right; font-weight:900; color:${isReceived ? 'var(--color-primary)' : 'var(--color-warning)'}">
                  ${isReceived ? '+' : '-'}${tx.amount || 0} 🪙
                </td>
                <td style="padding:0.75rem; text-align:right; color:var(--text-muted)">
                  ${new Date(tx.createdAt).toLocaleDateString()}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Bind navigation to stories if storyId is available
  container.querySelectorAll('tr[data-story-id]').forEach(tr => {
    const storyId = tr.dataset.storyId;
    if (storyId) {
      tr.addEventListener('click', () => navigateTo('story', { id: storyId }));
    }
  });
}

async function fetchTransactions() {
  const { user } = getState();
  if (!user) {
    transactions = [];
    loading = false;
    render();
    return;
  }

  if (_fetching) return;
  _fetching = true;

  loading = true;
  render();

  try {
    // We run two simple queries for sent and received, then merge and sort
    const sentSnap = await getDocs(query(collection(db, 'goldTransactions'), where('fromUid', '==', user.uid)));
    const receivedSnap = await getDocs(query(collection(db, 'goldTransactions'), where('toUid', '==', user.uid)));

    const merged = [];
    sentSnap.forEach(d => merged.push({ id: d.id, ...d.data() }));
    receivedSnap.forEach(d => {
      // Avoid duplicates if toUid == fromUid
      if (!merged.some(m => m.id === d.id)) {
        merged.push({ id: d.id, ...d.data() });
      }
    });

    merged.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    transactions = merged;
  } catch (err) {
    console.error('Failed to load transaction ledger:', err);
    showToast('❌ Failed to load transactions.', 'error');
  }

  loading = false;
  render();
  _fetching = false;
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
    pageShell = createPageShell('transactions-root', `
      <div class="page-header" style="margin-bottom:var(--space-lg);border-bottom:1px solid var(--color-border);padding-bottom:0.75rem">
        <h1>🪙 Harbor Gold Ledger</h1>
        <p>Review your history of supportive gold donations and received warmth.</p>
      </div>
      <div id="transactions-dynamic-content"></div>
    `);
  }

  initBugReport();

  // React to auth state updates
  const unsub = subscribe('user', fetchTransactions);
  registerPageSubscription(unsub);

  fetchTransactions();
}

guardAuth(init, 'transactions');
onPageEnter('transactions', init);
