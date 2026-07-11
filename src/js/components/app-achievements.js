import { t, subscribe, showConfirm, showToast } from '../store.js';
import { playSuccessChime } from '../audio.js';

// 🔥 Per-achievement tier thresholds
const ACHIEVEMENT_TIERS = {
  first_anchor:   { unlock: 1,   bronze: 5,   silver: 15,  gold: 30,  diamond: 50 },
  storyteller:    { unlock: 5,   bronze: 20,  silver: 50,  gold: 100, diamond: 200 },
  beacon:         { unlock: 1,   bronze: 100, silver: 1000, gold: 5000, diamond: 10000 },
  comment_captain:{ unlock: 3,   bronze: 50,  silver: 150, gold: 500, diamond: 1000 },
  generous:       { unlock: 50,  bronze: 200, silver: 500, gold: 1500, diamond: 3000 },
  love_legend:    { unlock: 5,   bronze: 50,  silver: 100, gold: 500, diamond: 1000 },
  high_seas:      { unlock: 50,  bronze: 200, silver: 500, gold: 1500, diamond: 3000 },
  gold_hoarder:   { unlock: 150, bronze: 500, silver: 1500, gold: 3000, diamond: 5000 },
};

// 🔥 Achievement definitions with clear descriptions
export const ACHIEVEMENT_DEFS = [
  { id: 'first_anchor',   icon: '✍️', key: 'ach_first_anchor',   fb: 'First Anchor',   desc: 'Write your first story',        metric: 'storyCount' },
  { id: 'storyteller',    icon: '📜', key: 'ach_storyteller',    fb: 'Storyteller',    desc: 'Write stories',                metric: 'storyCount' },
  { id: 'beacon',         icon: '⚓', key: 'ach_beacon',         fb: 'Beacon of Hope', desc: 'Gain followers',               metric: 'followers' },
  { id: 'comment_captain',icon: '💬', key: 'ach_comment_captain',fb: 'Comment Captain', desc: 'Post comments',               metric: 'commentCount' },
  { id: 'generous',       icon: '💰', key: 'ach_generous',       fb: 'Generous Captain', desc: 'Donate Gold',               metric: 'goldGiven' },
  { id: 'love_legend',    icon: '❤️', key: 'ach_love_legend',    fb: 'Love Legend',    desc: 'Receive likes',               metric: 'likesReceived' },
  { id: 'high_seas',      icon: '👑', key: 'ach_high_seas',      fb: 'High Seas King', desc: 'Receive Gold',               metric: 'goldReceived' },
  { id: 'gold_hoarder',   icon: '🪙', key: 'ach_gold_hoarder',   fb: 'Gold Hoarder',   desc: 'Accumulate Gold',             metric: 'goldBalance' },
];

// 🔥 Helper to get the current tier for a given achievement value
function getAchievementTierForValue(value, tiers) {
  if (value >= tiers.diamond) return 'diamond';
  if (value >= tiers.gold) return 'gold';
  if (value >= tiers.silver) return 'silver';
  if (value >= tiers.bronze) return 'bronze';
  if (value >= tiers.unlock) return 'unlocked';
  return 'locked';
}

// 🔥 Global rank (optional – used for the heading)
export function getGlobalTier(score) {
  if (score >= 220) return 'diamond';
  if (score >= 140) return 'platinum';
  if (score >= 80) return 'gold';
  if (score >= 40) return 'silver';
  return 'bronze';
}

// 🔥 Global score (sum of unlock thresholds – for rank)
export function computeAchievementScore(profile) {
  if (!profile) return 0;
  let score = 0;
  ACHIEVEMENT_DEFS.forEach((def) => {
    const val = getMetricValue(profile, def);
    const tiers = ACHIEVEMENT_TIERS[def.id];
    if (val >= tiers.unlock) score += tiers.unlock;
  });
  return score;
}

function getMetricValue(profile, def) {
  if (def.metric === 'followers') return profile.followers?.length || 0;
  return profile[def.metric] || 0;
}

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host { display: block; }
  .ach-section { margin: 0; }
  .ach-heading {
    font-size: var(--text-xs, 0.75rem); font-weight: 700; color: var(--text-muted);
    text-transform: uppercase; margin: 0 0 0.75rem; letter-spacing: 0.05em;
  }
  .ach-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: 0.75rem; }
  .ach-card {
    position: relative; border-radius: 1rem; padding: 1rem 0.75rem; text-align: center;
    border: 2px solid transparent; overflow: hidden; cursor: pointer;
    transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.35s, border-color 0.35s;
    background: var(--bg-secondary); min-height: 7rem; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 0.375rem;
  }
  .ach-card::before {
    content: ''; position: absolute; inset: -50%; opacity: 0.35;
    background: conic-gradient(from 0deg, transparent, rgba(255,255,255,0.15), transparent);
    animation: achRotate 6s linear infinite; pointer-events: none;
  }
  .ach-card:hover { transform: translateY(-4px) scale(1.03); }
  .ach-card.locked { opacity: 0.45; filter: grayscale(0.6); }
  .ach-card.locked::before { animation: none; opacity: 0.08; }
  .ach-card.locked:hover { transform: scale(1.02); filter: grayscale(0.4); }
  .ach-icon { font-size: 1.75rem; position: relative; z-index: 1; }
  .ach-label { font-size: 0.625rem; font-weight: 800; position: relative; z-index: 1; line-height: 1.3; }
  .ach-tier-tag {
    font-size: 0.5rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em;
    padding: 0.125rem 0.5rem; border-radius: 9999px; position: relative; z-index: 1;
  }

  /* ---- Bronze ---- */
  .ach-card.tier-bronze {
    background: linear-gradient(145deg, rgba(180,83,9,0.2), rgba(120,53,15,0.15), var(--bg-secondary));
    border-color: rgba(180,83,9,0.6);
    box-shadow: 0 0 20px rgba(180,83,9,0.3);
    animation: bronzeGlow 2.5s ease-in-out infinite;
  }
  .ach-card.tier-bronze .ach-tier-tag { background: linear-gradient(90deg,#92400e,#b45309); color: #fff; }

  /* ---- Silver ---- */
  .ach-card.tier-silver {
    background: linear-gradient(145deg, rgba(148,163,184,0.25), rgba(100,116,139,0.15), var(--bg-secondary));
    border-color: rgba(148,163,184,0.6);
    box-shadow: 0 0 24px rgba(148,163,184,0.35);
    animation: silverGlow 2.5s ease-in-out infinite;
  }
  .ach-card.tier-silver .ach-tier-tag { background: linear-gradient(90deg,#64748b,#94a3b8); color: #fff; }

  /* ---- Gold ---- */
  .ach-card.tier-gold {
    background: linear-gradient(145deg, rgba(234,179,8,0.28), rgba(245,158,11,0.12), var(--bg-secondary));
    border-color: rgba(234,179,8,0.65);
    box-shadow: 0 0 28px rgba(234,179,8,0.4);
    animation: goldGlow 2.5s ease-in-out infinite;
  }
  .ach-card.tier-gold .ach-tier-tag { background: linear-gradient(90deg,#b45309,#eab308); color: #1c1917; }

  /* ---- Diamond ---- */
  .ach-card.tier-diamond {
    background: linear-gradient(145deg, rgba(56,189,248,0.22), rgba(167,139,250,0.18), rgba(244,114,182,0.12));
    border-color: rgba(56,189,248,0.65);
    box-shadow: 0 0 36px rgba(56,189,248,0.45), 0 0 60px rgba(167,139,250,0.2);
    animation: diamondGlow 2.5s ease-in-out infinite;
  }
  .ach-card.tier-diamond .ach-tier-tag {
    background: linear-gradient(90deg,#38bdf8,#a78bfa,#f472b6); color: #fff;
    animation: achShimmer 2s ease-in-out infinite;
  }

  /* ---- Unlocked (no extra glow) ---- */
  .ach-card.tier-unlocked {
    background: linear-gradient(145deg, rgba(16,185,129,0.1), rgba(6,95,70,0.1), var(--bg-secondary));
    border-color: var(--color-primary-light);
    box-shadow: 0 0 12px rgba(16,185,129,0.15);
  }
  .ach-card.tier-unlocked .ach-tier-tag { background: var(--color-primary); color: #fff; }

  @keyframes achRotate { to { transform: rotate(360deg); } }
  @keyframes achShimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.85; transform: scale(1.05); } }
  @keyframes bronzeGlow { 0%, 100% { box-shadow: 0 0 20px rgba(180,83,9,0.3); } 50% { box-shadow: 0 0 30px rgba(180,83,9,0.5); } }
  @keyframes silverGlow { 0%, 100% { box-shadow: 0 0 24px rgba(148,163,184,0.35); } 50% { box-shadow: 0 0 36px rgba(148,163,184,0.55); } }
  @keyframes goldGlow { 0%, 100% { box-shadow: 0 0 28px rgba(234,179,8,0.4); } 50% { box-shadow: 0 0 40px rgba(234,179,8,0.6); } }
  @keyframes diamondGlow { 0%, 100% { box-shadow: 0 0 36px rgba(56,189,248,0.45), 0 0 60px rgba(167,139,250,0.2); } 50% { box-shadow: 0 0 50px rgba(56,189,248,0.6), 0 0 80px rgba(167,139,250,0.3); } }

  /* Mobile Viewports: horizontal layout matrix of sleek, rounded pill capsule badges */
  @media (max-width: 767px) {
    .ach-grid {
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: nowrap !important;
      gap: 0.375rem !important;
      overflow-x: auto !important;
      width: 100% !important;
      padding: 0.25rem 0.125rem 0.5rem !important;
      -webkit-overflow-scrolling: touch !important;
      scroll-snap-type: x mandatory !important;
    }
    .ach-grid::-webkit-scrollbar {
      display: none !important;
    }
    .ach-card {
      display: inline-flex !important;
      flex-direction: row !important;
      align-items: center !important;
      justify-content: flex-start !important;
      gap: 0.25rem !important;
      border-radius: 9999px !important;
      padding: 0.2rem 0.5rem !important;
      min-height: auto !important;
      height: 1.75rem !important;
      width: auto !important;
      flex-shrink: 0 !important;
      white-space: nowrap !important;
      scroll-snap-align: start !important;
    }
    .ach-card::before {
      display: none !important;
    }
    .ach-icon {
      font-size: 0.8125rem !important;
      line-height: 1 !important;
    }
    .ach-label {
      font-size: 0.5625rem !important;
      margin: 0 !important;
      line-height: 1 !important;
    }
    .ach-tier-tag {
      font-size: 0.45rem !important;
      padding: 0.08rem 0.25rem !important;
      border-radius: 9999px !important;
      margin-left: 0.1rem !important;
    }
  }

  /* Desktop Viewports: condense layout properties, reducing scales, gap, padding, text */
  @media (min-width: 768px) {
    .ach-grid {
      grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr)) !important;
      gap: 0.5rem !important;
    }
    .ach-card {
      min-height: 5rem !important;
      padding: 0.5rem !important;
      gap: 0.25rem !important;
    }
    .ach-icon {
      font-size: 1.25rem !important;
    }
    .ach-label {
      font-size: 0.5625rem !important;
    }
    .ach-tier-tag {
      font-size: 0.45rem !important;
      padding: 0.1rem 0.375rem !important;
    }
  }
</style>
<section class="ach-section">
  <h2 class="ach-heading" id="heading"></h2>
  <div class="ach-grid" id="grid"></div>
</section>
`;

class AppAchievements extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._profile = null;
    this._unsub = null;
    this._prevUnlocked = 0;
    // 🔥 Track previous tier for each achievement to show toast on tier change
    this._prevTiers = {};
  }

  connectedCallback() {
    this._unsub = subscribe('language', () => this._paint());
    this._parseProfile();
    this._paint();
  }

  disconnectedCallback() {
    if (this._unsub) this._unsub();
  }

  setProfile(profile) {
    this._profile = profile;
    this._paint();
  }

  _parseProfile() {
    const raw = this.getAttribute('profile');
    if (raw) {
      try { this._profile = JSON.parse(raw); } catch { /* noop */ }
    }
  }

  _metricValue(profile, def) {
    if (def.metric === 'followers') return profile.followers?.length || 0;
    return profile[def.metric] || 0;
  }

  // 🔥 Styled progress modal with description and clear labels
  _showProgress(def) {
    const profile = this._profile;
    if (!profile) return;
    const val = this._metricValue(profile, def);
    const tiers = ACHIEVEMENT_TIERS[def.id];
    const tier = getAchievementTierForValue(val, tiers);
    const isUnlocked = val >= tiers.unlock;
    const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
    const percent = isUnlocked ? Math.min(100, (val / tiers.diamond) * 100) : 0;

    const modalHTML = `
      <div style="text-align:center;padding:0.25rem 0;">
        <div style="font-size:2.5rem;line-height:1.2;">${def.icon}</div>
        <h3 style="font-size:1rem;font-weight:900;margin:0.25rem 0 0.25rem;color:var(--text-primary);">${t(def.key, def.fb)}</h3>
        <p style="font-size:0.75rem;color:var(--text-secondary);margin:0 0 0.5rem;">${def.desc}</p>
        <div style="display:inline-block;padding:0.125rem 0.75rem;border-radius:9999px;background:var(--color-primary);color:#fff;font-size:0.625rem;font-weight:700;margin-bottom:0.5rem;">
          ${isUnlocked ? tierLabel : '🔒 Locked'}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:0.5rem;color:var(--text-muted);margin-bottom:0.25rem;gap:0.25rem;flex-wrap:wrap;">
          <span>Unlock: <strong>${tiers.unlock}</strong></span>
          <span>🥉 Bronze: <strong>${tiers.bronze}</strong></span>
          <span>🥈 Silver: <strong>${tiers.silver}</strong></span>
          <span>🥇 Gold: <strong>${tiers.gold}</strong></span>
          <span>💎 Diamond: <strong>${tiers.diamond}</strong></span>
        </div>
        <div style="width:100%;height:0.5rem;background:var(--bg-secondary);border-radius:9999px;overflow:hidden;margin:0.25rem 0;">
          <div style="width:${Math.min(100, (val / tiers.diamond) * 100)}%;height:100%;background:var(--color-primary);border-radius:9999px;transition:width 0.5s;"></div>
        </div>
        <p style="font-size:0.625rem;color:var(--text-muted);margin:0.25rem 0 0;">
          ${isUnlocked ? `Progress: ${Math.round(percent)}% toward Diamond` : 'Not yet unlocked'}
        </p>
        <p style="font-size:0.625rem;color:var(--text-muted);margin:0.25rem 0 0;">
          Current value: <strong>${val}</strong>
        </p>
      </div>
    `;

    showConfirm(
      '🏆 Achievement Progress',
      modalHTML,
      false,
      () => {},
      '',
      'Close',
      null
    );
  }

  _paint() {
    const profile = this._profile;
    if (!profile) return;

    const unlockedCount = ACHIEVEMENT_DEFS.filter((d) => {
      const val = this._metricValue(profile, d);
      const tiers = ACHIEVEMENT_TIERS[d.id];
      return val >= tiers.unlock;
    }).length;

    // 🔥 Play sound for new unlocked achievement (if count increased)
    if (unlockedCount > this._prevUnlocked) playSuccessChime();
    this._prevUnlocked = unlockedCount;

    // 🔥 Compute current tiers and compare with previous to show toast
    const currentTiers = {};
    ACHIEVEMENT_DEFS.forEach((def) => {
      const val = this._metricValue(profile, def);
      const tiers = ACHIEVEMENT_TIERS[def.id];
      const tier = getAchievementTierForValue(val, tiers);
      currentTiers[def.id] = tier;
      const prevTier = this._prevTiers[def.id];
      if (prevTier && prevTier !== tier && tier !== 'locked') {
        // Tier changed to a higher non‑locked tier – show toast
        const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
        const name = t(def.key, def.fb);
        showToast(`🎉 Achievement "${name}" reached ${tierLabel}!`, 'success');
      }
    });
    // Save current tiers for next comparison
    this._prevTiers = currentTiers;

    const score = computeAchievementScore(profile);
    const globalTier = getGlobalTier(score);

    this.shadowRoot.getElementById('heading').textContent =
      `🏆 ${t('achievements_title', 'Achievements')} (${unlockedCount}/${ACHIEVEMENT_DEFS.length})`;

    this.shadowRoot.getElementById('grid').innerHTML = ACHIEVEMENT_DEFS.map((def) => {
      const val = this._metricValue(profile, def);
      const tiers = ACHIEVEMENT_TIERS[def.id];
      const tier = getAchievementTierForValue(val, tiers);
      const isUnlocked = val >= tiers.unlock;
      const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
      const displayTier = isUnlocked ? tier : 'locked';
      return `
        <div class="ach-card tier-${displayTier}" data-ach-id="${def.id}" title="${t(def.key, def.fb)} (${tierLabel})">
          <span class="ach-icon">${def.icon}</span>
          <span class="ach-label">${t(def.key, def.fb)}</span>
          <span class="ach-tier-tag">${isUnlocked ? tierLabel : t('ach_locked', 'Locked')}</span>
        </div>`;
    }).join('');

    this.shadowRoot.querySelectorAll('.ach-card').forEach((card) => {
      const id = card.dataset.achId;
      const def = ACHIEVEMENT_DEFS.find(d => d.id === id);
      if (def) {
        card.addEventListener('click', () => this._showProgress(def));
      }
    });

    this.shadowRoot.querySelector('.ach-section').dataset.globalTier = globalTier;
  }
}

customElements.define('app-achievements', AppAchievements);