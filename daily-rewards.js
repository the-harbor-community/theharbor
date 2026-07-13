/**
 * Daily rewards — gold claim with canvas animation
 * Refactored with persistent shell – no flicker.
 */
import { getState, t, showToast } from '../store.js';
import { db, doc, runTransaction } from '../firebase.js';
import { getDoc } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { initBugReport } from '../page-common.js';
import { registerPageCleanup, onPageEnter } from '../router.js';
import { guardAuth } from './shared.js';
import { playCoinSlash } from '../audio.js';
import { createPageShell } from '../utils/page-shell.js';
import { pageEl } from '../utils.js';

let alreadyClaimed = false;
let streakDays = 0;
let nextReward = 15;
let loading = false;
let showCoins = false;
let animFrame = null;

// 🔥 Persistent shell & fetch locks
let _mounted = false;
let _fetching = false;
let pageShell = null;

function el(id) { return pageEl(id); }

function render() {
  // Update static elements that are in the persistent shell
  const streakDaysEl = el('streak-days');
  const nextRewardEl = el('next-reward');
  const claimBtn = el('claim-btn');
  
  if (streakDaysEl) streakDaysEl.textContent = String(streakDays);
  if (nextRewardEl) nextRewardEl.textContent = String(nextReward);
  
  if (claimBtn) {
    claimBtn.disabled = loading || alreadyClaimed;
    claimBtn.textContent = loading ? t('loading', 'Claiming...') : alreadyClaimed ? '✓ Claimed Today' : '🎁 Claim Free Gold';
    claimBtn.className = `rewards-claim-btn ${alreadyClaimed ? 'rewards-claim-btn--claimed' : 'rewards-claim-btn--active'}`;
  }
  
  const canvas = el('coin-canvas');
  if (canvas) canvas.hidden = !showCoins;

  // Gamified Card Matrix Rendering - update only the dynamic container
  const matrixGrid = el('rewards-matrix-grid');
  const progressTrack = el('rewards-progress-track');
  
  if (matrixGrid) {
    let weekStart = Math.floor((streakDays - (alreadyClaimed ? 1 : 0)) / 7) * 7;
    if (weekStart < 0) weekStart = 0;

    let gridHtml = '';
    for (let i = 1; i <= 7; i++) {
      const dayNum = weekStart + i;
      let status = 'locked';
      
      if (alreadyClaimed) {
        if (dayNum <= streakDays) {
          status = 'claimed';
        }
      } else {
        if (dayNum <= streakDays) {
          status = 'claimed';
        } else if (dayNum === streakDays + 1) {
          status = 'claimable';
        }
      }

      const rewardAmt = Math.min(15 + (dayNum - 1) * 5, 50);
      let statusSvg = '';
      if (status === 'claimed') {
        statusSvg = `<svg class="reward-svg animate-claimed" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      } else if (status === 'claimable') {
        statusSvg = `<svg class="reward-svg animate-pulse-gold" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg>`;
      } else {
        statusSvg = `<svg class="reward-svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.4;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
      }

      gridHtml += `
        <div class="rewards-matrix-card rewards-matrix-card--${status}" data-day="${dayNum}">
          <div class="day-label">Day ${dayNum}</div>
          <div class="status-icon-wrap">${statusSvg}</div>
          <div class="gold-val">🪙 +${rewardAmt}</div>
        </div>
      `;
    }
    matrixGrid.innerHTML = gridHtml;

    // Bind card click event to claim if click is on claimable card
    matrixGrid.querySelectorAll('.rewards-matrix-card--claimable').forEach(card => {
      card.addEventListener('click', handleClaim);
    });

    // Progression track line percentage width
    if (progressTrack) {
      const claimedInCycle = streakDays - weekStart;
      const progressPercent = Math.min((claimedInCycle / 7) * 100, 100);
      progressTrack.style.width = `${progressPercent}%`;
    }
  }
}

async function checkClaimStatus() {
  if (_fetching) return;
  _fetching = true;
  
  const { user } = getState();
  if (!user) { _fetching = false; return; }
  try {
    const claimSnap = await getDoc(doc(db, 'dailyClaims', user.uid));
    if (claimSnap.exists()) {
      const data = claimSnap.data();
      const todayStr = new Date().toISOString().split('T')[0];
      alreadyClaimed = data.lastClaimedDate === todayStr;
      streakDays = data.streakDays || 0;
      nextReward = Math.min(15 + streakDays * 5, 50);
    } else {
      alreadyClaimed = false;
      streakDays = 0;
      nextReward = 15;
    }
    render();
  } catch (err) { console.warn(err); }
  _fetching = false;
}

function startCoinAnimation() {
  showCoins = true;
  render();
  const canvas = el('coin-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const parent = canvas.parentElement;
  canvas.width = parent.clientWidth || 400;
  canvas.height = parent.clientHeight || 400;

  const coins = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * -200 - 20,
    vy: Math.random() * 3 + 3.5,
    vx: Math.random() * 2 - 1,
    rotation: Math.random() * 360,
    rotationSpeed: Math.random() * 8 - 4,
    size: Math.random() * 6 + 6,
    opacity: Math.random() * 0.3 + 0.7,
  }));

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    coins.forEach(coin => {
      if (coin.y < canvas.height + 20) {
        alive = true;
        coin.y += coin.vy;
        coin.x += coin.vx;
        coin.rotation += coin.rotationSpeed;
        ctx.save();
        ctx.translate(coin.x, coin.y);
        ctx.rotate((coin.rotation * Math.PI) / 180);
        ctx.globalAlpha = coin.opacity;
        ctx.beginPath();
        ctx.ellipse(0, 0, coin.size, coin.size / 1.6, 0, 0, 2 * Math.PI);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0, 0, coin.size * 0.75, (coin.size * 0.75) / 1.6, 0, 0, 2 * Math.PI);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#d97706';
        ctx.font = 'bold 8px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 0);
        ctx.restore();
      }
    });
    if (alive) animFrame = requestAnimationFrame(draw);
    else { showCoins = false; render(); }
  }
  draw();
}

async function handleClaim() {
  if (alreadyClaimed) { showToast('⚠️ You have already claimed your daily reward today!', 'warning'); return; }
  const { user } = getState();
  loading = true;
  render();
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const claimRef = doc(db, 'dailyClaims', user.uid);
    const userRef = doc(db, 'users', user.uid);

    const result = await runTransaction(db, async (transaction) => {
      const claimSnap = await transaction.get(claimRef);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) throw new Error('User profile missing');

      let newStreak = 1;
      if (claimSnap.exists()) {
        const claimData = claimSnap.data();
        const lastClaimDate = claimData.lastClaimedDate;
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        if (lastClaimDate === yesterdayStr) newStreak = (claimData.streakDays || 0) + 1;
        else if (lastClaimDate === todayStr) throw new Error('Already claimed today');
      }

      const calculatedReward = Math.min(15 + (newStreak - 1) * 5, 50);
      const currentBalance = userSnap.data().goldBalance || 0;
      transaction.set(claimRef, { lastClaimedDate: todayStr, streakDays: newStreak, claimedAt: new Date().toISOString() }, { merge: true });
      transaction.update(userRef, { goldBalance: currentBalance + calculatedReward });
      return { calculatedReward, newStreak };
    });

    showToast(`🎉 Claimed! Received +${result.calculatedReward} 🪙 Gold! Streak: ${result.newStreak} Days`, 'success');
    alreadyClaimed = true;
    streakDays = result.newStreak;
    nextReward = Math.min(15 + result.newStreak * 5, 50);
    try {
      playCoinSlash();
    } catch (soundErr) {
      console.warn('Could not play claim sound:', soundErr);
    }
    startCoinAnimation();
  } catch (err) {
    showToast(`❌ Claim failed: ${err.message}`, 'error');
  } finally {
    loading = false;
    render();
  }
}

function init() {
  if (_mounted) return;
  _mounted = true;

  // Build persistent shell
  if (!pageShell) {
    pageShell = createPageShell('daily-rewards-root', `
      <button class="page-back" id="back-btn" type="button">← Back</button>
      
      <div class="rewards-hero animate-page-enter">
        <canvas id="coin-canvas" class="rewards-canvas" hidden></canvas>
        <div style="z-index: 10;">
          <span class="rewards-hero__icon" aria-hidden="true">🎁</span>
          <h1>Daily Rewards</h1>
          <p>Claim your free daily Harbor Gold to support creators and unlock special roles.</p>
          
          <div class="rewards-streak-box">
            <div class="rewards-streak-label">Current Streak</div>
            <div class="rewards-streak-value"><span id="streak-days">0</span> Days</div>
            <div style="font-size: 0.625rem; opacity: 0.8;">Next reward: +<span id="next-reward">15</span> Gold</div>
          </div>
        </div>
        
        <button id="claim-btn" class="rewards-claim-btn rewards-claim-btn--active">🎁 Claim Free Gold</button>
      </div>

      <!-- Gamified 7-Day Card Matrix Container -->
      <div class="rewards-matrix-container animate-page-enter" style="margin-top: 1.5rem;">
        <h2 style="font-size: var(--text-md); font-weight: 800; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; color: var(--text-primary);">
          <span>📅</span> 7-Day Check-in Streak Track
        </h2>
        <div class="rewards-progress-track-wrapper">
          <div class="rewards-progress-track" id="rewards-progress-track"></div>
        </div>
        <div class="rewards-matrix-grid" id="rewards-matrix-grid">
          <!-- Rendered dynamically by render() -->
        </div>
      </div>

      <div class="card" style="margin-top: 1.5rem; padding: 1.25rem;">
        <h2 style="font-size: var(--text-md); font-weight: 700; margin: 0 0 0.5rem;">📜 Rewards Rules</h2>
        <ul class="rewards-policy" style="margin: 0; padding-left: 1.25rem;">
          <li>Claim free gold once per day (resets at midnight local time).</li>
          <li>Your streak increases each day you claim consecutively.</li>
          <li>As your streak grows, your daily reward amount increases up to a maximum of 50 Gold!</li>
          <li>Missing a day resets your streak back to zero.</li>
        </ul>
      </div>
    `);
  }

  initBugReport();
  
  const btn = el('claim-btn');
  if (btn) {
    btn.addEventListener('click', handleClaim);
  }
  
  const backBtn = el('back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      import('../store.js').then(({ navigateTo }) => navigateTo('feed'));
    });
  }
  
  checkClaimStatus();

  registerPageCleanup(() => {
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
    _mounted = false;
    _fetching = false;
    pageShell = null;
  });
}

onPageEnter('daily-rewards', init);
