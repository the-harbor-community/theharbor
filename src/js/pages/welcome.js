import { subscribe, getState, t, navigateTo } from '../store.js';
import { onPageEnter, detectCurrentPageKey, registerPageSubscription } from '../router.js';
import { pageEl, setPageText } from '../utils.js';

const features = [
  {
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-adaptive-svg">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>`,
    title: 'feature_anon_title',
    desc: 'feature_anon_desc',
    fb: ['Anonymous Sharing', 'Post anonymously when you need to.']
  },
  {
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-adaptive-svg">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
    </svg>`,
    title: 'feature_support_title',
    desc: 'feature_support_desc',
    fb: ['Supportive Community', 'Connect with people who understand.']
  },
  {
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-adaptive-svg">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>`,
    title: 'feature_secure_title',
    desc: 'feature_secure_desc',
    fb: ['Private & Secure', 'Your data is always protected.']
  },
  {
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-adaptive-svg">
      <circle cx="12" cy="12" r="10"/>
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
    </svg>`,
    title: 'feature_harbors_title',
    desc: 'feature_harbors_desc',
    fb: ["Multiple Harbors", "Men's, Women's, Storm, Sunny & Compass."]
  },
  {
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-adaptive-svg">
      <circle cx="12" cy="8" r="7"/>
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
    </svg>`,
    title: 'feature_gold_title',
    desc: 'feature_gold_desc',
    fb: ['Earn Gold', 'Get 100 Gold free + daily rewards.']
  },
  {
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-adaptive-svg">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
      <path d="M4 22h16"/>
      <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"/>
      <path d="M12 2a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4 4 4 0 0 1-4-4V6a4 4 0 0 1 4-4Z"/>
    </svg>`,
    title: 'feature_leaderboard_title',
    desc: 'feature_leaderboard_desc',
    fb: ['Leaderboards', 'Compete for Love & Gold.']
  },
];

function render() {
  if (detectCurrentPageKey() !== 'welcome') return;
  const { user } = getState();
  if (user && user.emailVerified) { navigateTo('feed'); return; }

  const tagline = pageEl('tagline');
  if (!tagline) return;

  // Render uniform responsive inline vector Anchor SVG instead of raw emoji
  const welcomeIconEl = document.querySelector('.welcome-hero__icon');
  if (welcomeIconEl) {
    welcomeIconEl.innerHTML = `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block; margin:0 auto; color:var(--color-primary); filter:drop-shadow(0 4px 12px rgba(16,185,129,0.25));" class="theme-adaptive-svg">
      <circle cx="12" cy="5" r="3"/>
      <line x1="12" x2="12" y1="8" y2="22"/>
      <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
    </svg>`;
  }

  setPageText('tagline', t('welcome_hero_tagline', 'A safe place to share your story, find support, and heal together.'));
  const heroActions = pageEl('hero-actions');
  if (heroActions) {
    heroActions.innerHTML = `
    <button class="btn btn--hero-primary" id="join-btn" style="display:inline-flex; align-items:center; gap:0.5rem;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;" class="theme-adaptive-svg"><path d="M4.5 16.5c-1.5 1.26-2 3.38-2 4.44a.27.27 0 0 0 .38.24c1.12-.52 3-1.63 4-3a.27.27 0 0 0-.06-.39l-2-1.25a.27.27 0 0 0-.32-.04Z"/><path d="M12 15c-1.8-1.8-3-5.5-3-5.5L13 5s4 1.5 5.5 3c1.5 1.5 2 4.5 2 4.5L16.5 16s-2.7-1-4.5-1Z"/><path d="M17 7c.5.5 1.5 1 2 0s-.5-1.5-1-2-1.5-.5-2 0 .5 1.5 1 2Z"/></svg>
      <span>${t('welcome_join_btn', "Join Now — It's Free")}</span>
    </button>
    <button class="btn btn--hero-secondary" id="login-btn" style="display:inline-flex; align-items:center; gap:0.5rem;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;" class="theme-adaptive-svg"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <span>${t('welcome_already_have_account', 'I Already Have an Account')}</span>
    </button>`;
    pageEl('join-btn')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); window.openAuthModal('signup'); });
    pageEl('login-btn')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); window.openAuthModal('login'); });
  }

  const featuresEl = pageEl('features');
  if (featuresEl) {
    featuresEl.innerHTML = features.map(f => `
    <article class="feature-card">
      <span class="feature-card__icon">${f.icon}</span>
      <div class="feature-card__title">${t(f.title, f.fb[0])}</div>
      <div class="feature-card__desc">${t(f.desc, f.fb[1])}</div>
    </article>`).join('');
  }
}

function init() {
  registerPageSubscription(subscribe('authLoading', render));
  registerPageSubscription(subscribe('user', render));
  registerPageSubscription(subscribe('language', render));
  render();
}

onPageEnter('welcome', init);
