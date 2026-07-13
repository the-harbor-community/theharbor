/**
 * Transactions page — gold donation history
 * Refactored with persistent shell – no flicker.
 */
import { getState, t, navigateTo } from '../store.js';
import { db, collection } from '../firebase.js';
import { getDocs, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { initBugReport } from '../page-common.js';
import { guardAuth } from './shared.js';
import { createPageShell } from '../utils/page-shell.js';
import { detectCurrentPageKey, onPageEnter } from '../router.js';

let goldTx = [];
let loading = true;

// 🔥 Persistent shell & fetch locks
let _mounted = false;
let _fetching = false;
let pageShell = null;

function el(id) { return document.getElementById(id); }
function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function render() {
  const container = el('transactions-dynamic-content');
  if (!container) return;

  if (loading) {
    container.innerHTML = '<div class="page-skeleton"></div>';
    return;
  }

  const listBuffer = document.createElement('div');
  
  listBuffer.innerHTML = goldTx.length ? goldTx.map(tx => `
    <div class="card list-item animate-fade-in" style="margin-bottom:var(--space-sm);cursor:default;display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:var(--text-xs);font-weight:700">${tx.displayText ? esc(tx.displayText) : `Sent <span style="color:#d97706">${tx.amount} 🪙</span> to <span style="color:var(--color-primary)">${esc(tx.toName)}</span>`}</div>
        ${tx.message ? `<div style="font-size:0.6875rem;font-style:italic;color:var(--text-secondary);margin-top:0.25rem">"${esc(tx.message)}"</div>` : ''}
        ${tx.storyTitle ? `<div style="font-size:0.625rem;color:var(--text-muted);margin-top:0.25rem">Story: "${esc(tx.storyTitle)}"</div>` : ''}
      </div>
      <span style="font-size:0.625rem;color:var(--text-muted);white-space:nowrap">${new Date(tx.createdAt).toLocaleDateString()}</span>
    </div>`).join('') : '<div class="page-empty card">No transactions logged yet. Try donating gold to support someone!</div>';

  container.replaceChildren(...listBuffer.childNodes);
}

async function fetchTransactions() {
  if (_fetching) return;
  _fetching = true;

  const { user } = getState();
  if (!user) { _fetching = false; return; }
  
  loading = true;
  render();
  
  try {
    const snap = await getDocs(query(collection(db, 'goldTransactions'), where('fromUid', '==', user.uid), orderBy('createdAt', 'desc'), limit(20)));
    goldTx = [];
    snap.forEach(d => goldTx.push({ id: d.id, ...d.data() }));
  } catch (err) { console.warn(err); }
  loading = false;
  render();
  _fetching = false;
}

function init() {
  if (_mounted) return;
  _mounted = true;

  // Build persistent shell
  if (!pageShell) {
    pageShell = createPageShell('transactions-root', `
      <div class="page-header">
        <h1>🪙 ${t('transaction_history', 'Transaction History')}</h1>
        <p>Review all your Harbor Gold donations sent and received.</p>
      </div>
      <div id="transactions-dynamic-content"></div>
    `);
  }

  initBugReport();
  fetchTransactions();
}

onPageEnter('transactions', init);
