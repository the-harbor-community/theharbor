import { onPageEnter } from '../router.js';
import { t, showToast, getState } from '../store.js';
import { db } from '../firebase.js';
import { 
  collection, addDoc, getDocs, query, where, orderBy 
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

// Single configurable variables at the top of the file for extreme administrative convenience
export const PAYONEER_CUSTOMER_ID = '105247932';
export const PAYONEER_DUMMY_GMAIL = 'theharbor.community.official@gmail.com';

const BDT_RATE = 120; // 1 USD = 120 BDT
const MONTHLY_GOAL = 150; // $150 USD Goal

function initDonatePage() {
  const cards = document.querySelectorAll('.tier-card');
  const customInput = document.getElementById('custom-donation');
  const summaryText = document.getElementById('donation-summary-text');

  // Tabs and Panels
  const tabPayoneer = document.getElementById('tab-payoneer');
  const tabBkash = document.getElementById('tab-bkash');
  const panelPayoneer = document.getElementById('panel-payoneer');
  const panelBkash = document.getElementById('panel-bkash');

  // Payoneer Elements
  const copyPayoneerBtn = document.getElementById('copy-payoneer-btn');
  const payoneerNumberElement = document.getElementById('payoneer-number');
  const payoneerSenderInput = document.getElementById('payoneer-sender-input');
  const payoneerTrxidInput = document.getElementById('payoneer-trxid-input');
  const payoneerSubmitBtn = document.getElementById('payoneer-submit-btn');

  // bKash Elements
  const bkashConvText = document.getElementById('bkash-amount-conversion');
  const copyBkashBtn = document.getElementById('copy-bkash-btn');
  const bkashNumberElement = document.getElementById('bkash-number');
  const bkashSenderInput = document.getElementById('bkash-sender-input');
  const bkashTrxidInput = document.getElementById('bkash-trxid-input');
  const bkashSubmitBtn = document.getElementById('bkash-submit-btn');

  // History List Section
  const historySection = document.getElementById('donation-history-section');
  const historyList = document.getElementById('donation-history-list');

  // Public Tracker Elements
  const goalProgressBar = document.getElementById('goal-progress-bar');
  const goalRaisedText = document.getElementById('goal-raised-text');
  const goalTargetText = document.getElementById('goal-target-text');
  const benefactorsSection = document.getElementById('benefactors-section');
  const benefactorsList = document.getElementById('benefactors-list');

  let currentAmount = 10; // Default selected tier amount is $10

  function updateDisplay() {
    if (summaryText) {
      summaryText.textContent = `$${parseFloat(currentAmount.toString()).toFixed(2)} USD`;
    }
    if (bkashConvText) {
      const bdtAmount = Math.round(currentAmount * BDT_RATE);
      bkashConvText.textContent = `৳${bdtAmount.toLocaleString()} BDT`;
    }
  }

  // Fetch approved donations for the global goals tracker and benefactors list
  async function loadGlobalStats() {
    try {
      const q = query(collection(db, 'donations'), where('status', '==', 'approved'));
      const snap = await getDocs(q);
      
      let totalUSD = 0;
      const approvedDonations = [];

      snap.forEach(docSnap => {
        const d = docSnap.data();
        approvedDonations.push(d);
        const amt = parseFloat(d.amount || 0);
        totalUSD += amt;
      });

      // Update ProgressBar
      if (goalProgressBar) {
        const percentage = Math.min((totalUSD / MONTHLY_GOAL) * 100, 100);
        goalProgressBar.style.width = `${percentage}%`;
      }
      if (goalRaisedText) {
        goalRaisedText.textContent = `$${totalUSD.toFixed(2)} Raised`;
      }
      if (goalTargetText) {
        goalTargetText.textContent = `Goal: $${MONTHLY_GOAL}`;
      }

      // Update Benefactors Listing
      if (benefactorsSection && benefactorsList) {
        if (approvedDonations.length > 0) {
          benefactorsSection.style.display = 'flex';
          
          // Sort descending by timestamp
          approvedDonations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          
          benefactorsList.innerHTML = approvedDonations.map(d => {
            const dateStr = new Date(d.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            return `
              <div style="background: var(--bg-primary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0.5rem; display: flex; align-items: center; justify-content: space-between; font-size: 0.75rem;">
                <div>
                  <div style="font-weight: 800; color: var(--text-primary);">⚓ ${escapeHtml(d.userName)}</div>
                  <div style="font-size: 0.6rem; color: var(--text-muted);">${dateStr}</div>
                </div>
                <div style="font-weight: 800; color: #10b981;">+$${parseFloat(d.amount).toFixed(2)}</div>
              </div>
            `;
          }).join('');
        } else {
          benefactorsList.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); font-size: 0.75rem; padding: 1.5rem 0;">
              No contributors validated this month yet.
            </div>
          `;
        }
      }
    } catch (err) {
      console.warn('Could not load community tracker stats:', err);
    }
  }

  // Fetch logged-in user's transaction history from Firestore
  async function loadUserHistory() {
    if (!historySection || !historyList) return;
    const { user } = getState();
    if (!user) {
      historySection.style.display = 'none';
      return;
    }

    try {
      const q = query(collection(db, 'donations'), where('userId', '==', user.uid));
      const snap = await getDocs(q);
      const userDonations = [];
      snap.forEach(docSnap => {
        userDonations.push({ id: docSnap.id, ...docSnap.data() });
      });

      // Sort descending by timestamp
      userDonations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      if (userDonations.length === 0) {
        historySection.style.display = 'none';
        return;
      }

      historySection.style.display = 'block';
      historyList.innerHTML = userDonations.map(item => {
        const dateStr = new Date(item.timestamp).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        const isBkash = item.method === 'bKash';
        
        let badgeStyle = 'background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.2);';
        let badgeText = 'Pending Review';

        if (item.status === 'approved') {
          badgeStyle = 'background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2);';
          badgeText = 'Approved ✓';
        } else if (item.status === 'rejected') {
          badgeStyle = 'background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2);';
          badgeText = 'Rejected';
        }

        const valText = isBkash ? `৳${Math.round(item.amount * BDT_RATE).toLocaleString()} BDT` : `$${parseFloat(item.amount).toFixed(2)}`;

        return `
          <div style="background: var(--bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 0.75rem; display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; font-size: 0.75rem;">
            <div>
              <div style="font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 0.375rem;">
                <span>${isBkash ? '📱 bKash' : '💳 Payoneer'}</span>
                <span style="font-size: 0.65rem; padding: 0.1rem 0.35rem; border-radius: 9999px; ${badgeStyle}">${badgeText}</span>
              </div>
              <div style="color: var(--text-muted); font-size: 0.65rem; margin-top: 0.15rem;">
                ${dateStr} • TrxID: <span style="font-family: monospace;">${escapeHtml(item.trxId)}</span>
              </div>
            </div>
            <div style="font-weight: 800; font-size: 0.875rem; color: var(--text-primary);">${valText}</div>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.warn('Could not load user donation history:', err);
    }
  }

  // Switcher Active Status
  if (tabPayoneer && tabBkash) {
    tabPayoneer.addEventListener('click', () => {
      tabPayoneer.classList.add('active');
      tabPayoneer.style.background = 'var(--color-primary)';
      tabPayoneer.style.color = '#fff';

      tabBkash.classList.remove('active');
      tabBkash.style.background = 'transparent';
      tabBkash.style.color = 'var(--text-muted)';

      if (panelPayoneer) panelPayoneer.style.display = 'block';
      if (panelBkash) panelBkash.style.display = 'none';
    });

    tabBkash.addEventListener('click', () => {
      tabBkash.classList.add('active');
      tabBkash.style.background = 'var(--color-primary)';
      tabBkash.style.color = '#fff';

      tabPayoneer.classList.remove('active');
      tabPayoneer.style.background = 'transparent';
      tabPayoneer.style.color = 'var(--text-muted)';

      if (panelPayoneer) panelPayoneer.style.display = 'none';
      if (panelBkash) panelBkash.style.display = 'block';
    });
  }

  // Copy Action helper
  function setupCopyBtn(btn, sourceElement, name) {
    if (btn && sourceElement) {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(sourceElement.textContent.trim()).then(() => {
          const originalText = btn.textContent;
          btn.textContent = '✅ Copied!';
          showToast(`${name} copied to clipboard.`, 'success');
          setTimeout(() => {
            btn.textContent = originalText;
          }, 2000);
        }).catch(() => {
          showToast('Failed to copy. Please copy manually.', 'error');
        });
      });
    }
  }

  setupCopyBtn(copyPayoneerBtn, payoneerNumberElement, 'Payoneer ID');
  setupCopyBtn(copyBkashBtn, bkashNumberElement, 'bKash number');

  // Verify Auth before transaction submission helper
  function checkAuthForSubmit() {
    const { user } = getState();
    if (!user) {
      showToast('Please sign in to log and verify your donation.', 'warning');
      const modal = document.getElementById('auth-modal') || document.querySelector('app-auth-modal');
      if (modal) {
        modal.removeAttribute('hidden');
      }
      return null;
    }
    return user;
  }

  // Submit Payoneer verification
  if (payoneerSubmitBtn) {
    payoneerSubmitBtn.addEventListener('click', async () => {
      const user = checkAuthForSubmit();
      if (!user) return;

      if (!currentAmount || currentAmount <= 0) {
        showToast('Please select or input a donation amount first.', 'warning');
        return;
      }

      const senderInput = payoneerSenderInput ? payoneerSenderInput.value.trim() : '';
      const trxId = payoneerTrxidInput ? payoneerTrxidInput.value.trim() : '';

      if (!senderInput || senderInput.length < 3) {
        showToast('Please enter a valid Payoneer sender email or name.', 'warning');
        return;
      }

      if (!trxId || trxId.length < 4) {
        showToast('Please enter a valid Transaction ID or reference.', 'warning');
        return;
      }

      try {
        const { userData } = getState();
        const payload = {
          userId: user.uid,
          userName: userData?.name || user.displayName || 'Sailor',
          userEmail: user.email,
          amount: currentAmount,
          method: 'Payoneer',
          sender: senderInput,
          trxId: trxId.toUpperCase(),
          timestamp: new Date().toISOString(),
          status: 'pending'
        };

        payoneerSubmitBtn.disabled = true;
        payoneerSubmitBtn.textContent = '⏳ Submitting...';

        await addDoc(collection(db, 'donations'), payload);

        // Clear fields
        if (payoneerSenderInput) payoneerSenderInput.value = '';
        if (payoneerTrxidInput) payoneerTrxidInput.value = '';

        showToast('🎉 Payoneer verification details submitted! Admin captains will confirm shortly.', 'success');
        
        await loadUserHistory();
      } catch (err) {
        showToast(`❌ Verification failed: ${err.message}`, 'error');
      } finally {
        payoneerSubmitBtn.disabled = false;
        payoneerSubmitBtn.textContent = '💖 Confirm Payoneer Donation';
      }
    });
  }

  // Submit bKash verification
  if (bkashSubmitBtn) {
    bkashSubmitBtn.addEventListener('click', async () => {
      const user = checkAuthForSubmit();
      if (!user) return;

      if (!currentAmount || currentAmount <= 0) {
        showToast('Please select or input a donation amount first.', 'warning');
        return;
      }

      const senderNum = bkashSenderInput ? bkashSenderInput.value.trim() : '';
      const trxId = bkashTrxidInput ? bkashTrxidInput.value.trim() : '';

      if (!senderNum || senderNum.length < 11) {
        showToast('Please enter a valid 11-digit bKash sender number.', 'warning');
        return;
      }

      if (!trxId || trxId.length < 4) {
        showToast('Please enter a valid bKash Transaction ID (TrxID).', 'warning');
        return;
      }

      try {
        const { userData } = getState();
        const payload = {
          userId: user.uid,
          userName: userData?.name || user.displayName || 'Sailor',
          userEmail: user.email,
          amount: currentAmount,
          method: 'bKash',
          sender: senderNum,
          trxId: trxId.toUpperCase(),
          timestamp: new Date().toISOString(),
          status: 'pending'
        };

        bkashSubmitBtn.disabled = true;
        bkashSubmitBtn.textContent = '⏳ Submitting...';

        await addDoc(collection(db, 'donations'), payload);

        // Clear fields
        if (bkashSenderInput) bkashSenderInput.value = '';
        if (bkashTrxidInput) bkashTrxidInput.value = '';

        showToast('🎉 bKash verification details submitted! Admin captains will confirm shortly.', 'success');
        
        await loadUserHistory();
      } catch (err) {
        showToast(`❌ Verification failed: ${err.message}`, 'error');
      } finally {
        bkashSubmitBtn.disabled = false;
        bkashSubmitBtn.textContent = '🌸 Confirm bKash Donation';
      }
    });
  }

  // Bind tier cards click events
  cards.forEach(card => {
    card.addEventListener('click', () => {
      // Remove active class from all other cards
      cards.forEach(c => {
        c.classList.remove('selected');
        const badge = c.querySelector('.mt-4');
        if (badge) {
          badge.className = 'mt-4 py-2 border border-border rounded-full text-xs font-bold text-muted-foreground transition-all';
          badge.textContent = 'Select';
        }
      });

      // Clear custom input field
      if (customInput) customInput.value = '';

      // Activate clicked card
      card.classList.add('selected');
      const badge = card.querySelector('.mt-4');
      if (badge) {
        badge.className = 'mt-4 py-2 bg-emerald-500 text-neutral-950 rounded-full text-xs font-bold transition-all';
        badge.textContent = 'Selected';
      }

      // Update current value
      const val = parseInt(card.dataset.amount || '0', 10);
      currentAmount = val;
      updateDisplay();
    });
  });

  // Bind custom input event
  if (customInput) {
    customInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) {
        currentAmount = val;

        // Remove selection from pre-set cards
        cards.forEach(c => {
          c.classList.remove('selected');
          const badge = c.querySelector('.mt-4');
          if (badge) {
            badge.className = 'mt-4 py-2 border border-border rounded-full text-xs font-bold text-muted-foreground transition-all';
            badge.textContent = 'Select';
          }
        });
      } else {
        currentAmount = 0;
      }
      updateDisplay();
    });
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
  }

  // Initial renders
  updateDisplay();
  loadGlobalStats();
  loadUserHistory();
}

onPageEnter('donate', () => {
  initDonatePage();
});
