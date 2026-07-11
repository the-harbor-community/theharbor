/**
 * Transactions page — gold donation history
 */
import { getState, t, navigateTo } from '../store.js';
import { db, collection } from '../firebase.js';
import { getDocs, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { initBugReport } from '../page-common.js';
import { guardAuth } from './shared.js';

let goldTx = [];
let loading = true;

function el(id) { return document.getElementById(id); }
function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function render() {
  const root = el('transactions-root');
  if (loading) { root.innerHTML = '<div class="page-skeleton"></div>'; return; }

  root.innerHTML = `
    <div class="page-header"><h1>🪙 ${t('transaction_history', 'Transaction History')}</h1>
      <p>Review all your Harbor Gold donations sent and received.</p></div>
    ${goldTx.length ? goldTx.map(tx => `
      <div class="card list-item" style="margin-bottom:var(--space-sm);cursor:default;display:flex;justify-content:space-between;align-items:flex-start">
        <div><div style="font-size:var(--text-xs);font-weight:700">${tx.displayText ? esc(tx.displayText) : `Sent <span style="color:#d97706">${tx.amount} 🪙</span> to <span style="color:var(--color-primary)">${esc(tx.toName)}</span>`}</div>
          ${tx.message ? `<div style="font-size:0.6875rem;font-style:italic;color:var(--text-secondary);margin-top:0.25rem">"${esc(tx.message)}"</div>` : ''}
          ${tx.storyTitle ? `<div style="font-size:0.625rem;color:var(--text-muted);margin-top:0.25rem">Story: "${esc(tx.storyTitle)}"</div>` : ''}</div>
        <span style="font-size:0.625rem;color:var(--text-muted);white-space:nowrap">${new Date(tx.createdAt).toLocaleDateString()}</span>
      </div>`).join('') : '<div class="page-empty card">No transactions logged yet. Try donating gold to support someone!</div>'}`;
}

async function fetchTransactions() {
  const { user } = getState();
  if (!user) return;
  
  let isBackground = false;
  if (goldTx.length > 0) {
    loading = false;
    isBackground = true;
    render();
  } else {
    loading = true;
    render();
  }
  
  try {
    const snap = await getDocs(query(collection(db, 'goldTransactions'), where('fromUid', '==', user.uid), orderBy('createdAt', 'desc'), limit(20)));
    goldTx = [];
    snap.forEach(d => goldTx.push({ id: d.id, ...d.data() }));
  } catch (err) { console.warn(err); }
  loading = false;
  render();
}

function init() { initBugReport(); fetchTransactions(); }
guardAuth(init, 'transactions');
