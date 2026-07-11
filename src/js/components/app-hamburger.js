import { getState, closeMobileMenu, openMobileMenu, navigateTo, subscribe, t } from '../store.js';
import { playRibbonSlide } from '../audio.js';

const template = document.createElement('template');
template.innerHTML = `
<style>
  *[hidden] { display: none !important; }
  :host { display: contents; }
  .backdrop {
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px);
    z-index: 250; opacity: 0; transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .backdrop.open { opacity: 1; animation: fadeIn 0.2s forwards; }
  .backdrop[hidden] { display: none; }
  .panel {
    position: fixed; top: 0; right: 0; bottom: 0; height: 100%; height: 100svh; height: 100dvh; width: 320px; max-width: 90vw;
    background: var(--color-card); color: var(--text-primary); z-index: 260;
    box-shadow: var(--shadow-lg); border-left: 1px solid rgba(16, 185, 129, 0.1);
    display: flex; flex-direction: column;
    transform: translateX(100%); transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    overflow: hidden;
    box-sizing: border-box;
  }
  .panel.open { transform: translateX(0); }
  .panel[hidden] { display: none; }
  .header {
    display: flex; align-items: center; justify-content: space-between; padding: 1rem;
    background: var(--color-primary); color: #fff; font-weight: 700;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
    flex-shrink: 0;
  }
  .header-title { display: flex; align-items: center; gap: 0.5rem; font-size: 1rem; font-weight: 900; letter-spacing: -0.025em; }
  .header-icon { display: inline-block; font-size: 1.25rem; animation: floatGentle 4s ease-in-out infinite; }
  .close-btn { background: none; border: none; color: #fff; font-size: 1.125rem; font-weight: 900; padding: 0.5rem; cursor: pointer; transition: color 0.15s; }
  .close-btn:hover { color: #fca5a5; }
  .body { flex: 1; min-height: 0; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; justify-content: space-between; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; padding-top: 0.5rem; }
  .nav-item {
    padding: 1rem; background: var(--bg-secondary); border: 1px solid var(--color-border);
    border-radius: 0.75rem; cursor: pointer; text-align: center; font-family: inherit;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.375rem;
    box-shadow: var(--shadow-sm); transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s, background 0.2s;
    position: relative; overflow: visible;
  }
  .nav-item:hover { background: rgba(16, 185, 129, 0.05); border-color: rgba(52, 211, 153, 0.5); }
  .nav-item:active { transform: scale(0.95); }
  .nav-item.clicked { animation: ringGlow 0.45s ease-out; border-color: #34d399; }
  .nav-item .icon { font-size: 1.5rem; transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
  .nav-item:hover .icon { transform: scale(1.1); }
  .nav-item.clicked .icon { animation: iconGlow 0.45s ease-out; }
  .nav-item .label { font-size: 0.75rem; font-weight: 900; color: var(--text-primary); }
  .sub-nav {
    background: var(--bg-secondary); border: 1px solid var(--color-border); padding: 0.875rem;
    border-radius: 1rem; display: flex; align-items: center; justify-content: space-around; gap: 0.5rem;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.06); margin-top: 1.5rem;
  }
  .sub-link {
    background: none; border: none; cursor: pointer; font-family: inherit;
    font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);
    display: flex; flex-direction: column; align-items: center; gap: 0.25rem;
    transition: color 0.15s, transform 0.15s;
  }
  .sub-link:hover { color: var(--color-primary); }
  .sub-link.clicked { color: var(--color-primary); }
  .sub-link.clicked .sub-icon { transform: scale(1.25); color: #34d399; }
  .sub-link.danger { color: var(--color-danger); }
  .sub-link.danger.clicked { transform: scale(1.05); font-weight: 900; }
  .sub-link.danger.clicked .sub-icon { animation: pulse 1s ease-in-out infinite; transform: scale(1.25); color: #ef4444; }
  .sub-divider { height: 1.5rem; width: 1px; background: var(--color-border); }
  .footer { padding-top: 1.5rem; border-top: 1px solid var(--color-border); margin-top: auto; text-align: center; }
  .footer-text { font-size: 0.625rem; color: var(--text-muted); font-weight: 700; line-height: 1.6; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
  @keyframes floatGentle { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
  @keyframes ringGlow { 0% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.6); } 100% { box-shadow: 0 0 0 8px rgba(52, 211, 153, 0); } }
  @keyframes iconGlow { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.4); transform: scale(1.15); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
</style>
<div class="backdrop" hidden></div>
<aside class="panel" hidden role="dialog" aria-label="Navigation Menu">
  <div class="header">
    <span class="header-title">
      <span class="header-icon" style="display:inline-block; vertical-align:middle; width:20px; height:20px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="5" r="3"/>
          <line x1="12" x2="12" y1="8" y2="22"/>
          <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
          <circle cx="5" cy="12" r="1"/>
          <circle cx="19" cy="12" r="1"/>
        </svg>
      </span>
      The Harbor
    </span>
    <button class="close-btn" id="close" aria-label="Close menu">✕</button>
  </div>
  <div class="body">
    <div>
      <div class="grid" id="grid"></div>
      <div class="sub-nav" id="sub-nav"></div>
    </div>
    <div class="footer">
      <div class="footer-text">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;">
          <circle cx="12" cy="5" r="3"/>
          <line x1="12" x2="12" y1="8" y2="22"/>
          <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
        </svg>
        The Harbor — A community for sharing, healing, and growing.
      </div>
    </div>
  </div>
</aside>
`;

function getHamburgerIconSvg(id, isDanger = false) {
  const stroke = "currentColor";
  switch (id) {
    case 'admin':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/>
        <rect x="5" y="16" width="14" height="4" rx="1"/>
      </svg>`;
    case 'activity':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>`;
    case 'transactions':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect width="20" height="14" x="2" y="5" rx="2"/>
        <line x1="2" x2="22" y1="10" y2="10"/>
      </svg>`;
    case 'donate':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
      </svg>`;
    case 'leaderboard':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
        <path d="M4 22h16"/>
        <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"/>
        <path d="M12 2a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4 4 4 0 0 1-4-4V6a4 4 0 0 1 4-4Z"/>
      </svg>`;
    case 'daily-rewards':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 12 20 22 4 22 4 12"/>
        <rect width="20" height="5" x="2" y="7" rx="1"/>
        <line x1="12" x2="12" y1="22" y2="7"/>
        <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7Z"/>
        <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z"/>
      </svg>`;
    case 'admin-bugs':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>`;
    case 'about':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4"/>
        <path d="M12 8h.01"/>
      </svg>`;
    case 'philosophy':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="5" r="3"/>
        <line x1="12" x2="12" y1="8" y2="22"/>
        <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
        <circle cx="5" cy="12" r="1"/>
        <circle cx="19" cy="12" r="1"/>
      </svg>`;
    case 'terms':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" x2="8" y1="13" y2="13"/>
        <line x1="16" x2="8" y1="17" y2="17"/>
        <line x1="10" x2="8" y1="9" y2="9"/>
      </svg>`;
    case 'privacy':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;">
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>`;
    case 'emergency':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${isDanger ? '#ef4444' : stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
        <line x1="12" x2="12" y1="9" y2="13"/>
        <line x1="12" x2="12.01" y1="17" y2="17"/>
      </svg>`;
    default:
      return '';
  }
}

class AppHamburger extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._isOpen = false;
    this._clickedItem = null;
  }

  connectedCallback() {
    if (this._mounted) return;
    this._mounted = true;
    this._backdrop = this.shadowRoot.querySelector('.backdrop');
    this._panel = this.shadowRoot.querySelector('.panel');
    this._backdrop.addEventListener('click', () => this.close());
    this.shadowRoot.getElementById('close').addEventListener('click', () => this.close());
    subscribe('menuOpen', () => this._syncFromStore());
    subscribe('user', () => {
      const { user } = getState();
      if (!user) {
        this.close();
        this._hidePanel();
      }
    });
    this._syncFromStore();
  }

  open() { openMobileMenu(); }

  close() { closeMobileMenu(); }

  _syncFromStore() {
    if (getState().menuOpen) this._showPanel();
    else this._hidePanel();
  }

  _showPanel() {
    const { user } = getState();
    if (!user) {
      if (getState().menuOpen) closeMobileMenu();
      return;
    }
    if (this._isOpen) return;
    this._isOpen = true;
    playRibbonSlide();
    this._clickedItem = null;
    this._renderGrid();
    this._renderSubNav();
    this._backdrop.hidden = false;
    this._panel.hidden = false;
    requestAnimationFrame(() => {
      this._backdrop.classList.add('open');
      this._panel.classList.add('open');
    });
  }

  _hidePanel() {
    if (!this._isOpen) return;
    this._isOpen = false;
    this._backdrop.classList.remove('open');
    this._panel.classList.remove('open');
    setTimeout(() => {
      this._backdrop.hidden = true;
      this._panel.hidden = true;
    }, 300);
  }

  _handleNavigate(page) {
    const { user } = getState();
    this._clickedItem = page;
    this._renderGrid();
    if (page === 'admin-bugs' && user) {
      localStorage.setItem(`last_viewed_bug_fix_${user.uid}`, new Date().toISOString());
    }
    setTimeout(() => {
      this._clickedItem = null;
      this.close();
      navigateTo(page);
    }, 450);
  }

  _renderGrid() {
    const { userData } = getState();
    const items = [
      ...(userData?.isAdmin ? [{ id: 'admin', label: t('admin', 'Admin') }] : []),
      { id: 'activity', label: t('activity', 'Activity') },
      { id: 'transactions', label: t('transaction_history', 'Transactions') },
      { id: 'donate', label: t('donate', 'Donate') },
      { id: 'leaderboard', label: t('nav_top', 'Top') },
      { id: 'daily-rewards', label: t('nav_daily', 'Daily') },
      { id: 'admin-bugs', label: t('nav_bugs', 'Bug Fixes') },
      { id: 'about', label: t('nav_about', 'About') },
      { id: 'philosophy', label: t('nav_philosophy', 'Philosophy') },
    ];
    this.shadowRoot.getElementById('grid').innerHTML = items.map(i => `
      <button type="button" class="nav-item${this._clickedItem === i.id ? ' clicked' : ''}" data-page="${i.id}">
        <span class="icon">${getHamburgerIconSvg(i.id)}</span>
        <span class="label">${i.label}</span>
      </button>`).join('');
    this.shadowRoot.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this._handleNavigate(btn.dataset.page); });
    });
  }

  _renderSubNav() {
    const subItems = [
      { id: 'terms', label: t('terms', 'Terms'), danger: false },
      { id: 'privacy', label: t('privacy', 'Privacy'), danger: false },
      { id: 'emergency', label: t('emergency', 'Emergency'), danger: true },
    ];
    this.shadowRoot.getElementById('sub-nav').innerHTML = subItems.map((item, idx) => `
      ${idx > 0 ? '<div class="sub-divider"></div>' : ''}
      <button type="button" class="sub-link${item.danger ? ' danger' : ''}${this._clickedItem === item.id ? ' clicked' : ''}" data-page="${item.id}">
        <span class="sub-icon">${getHamburgerIconSvg(item.id, item.danger)}</span> ${item.label}
      </button>`).join('');
    this.shadowRoot.querySelectorAll('.sub-link').forEach(btn => {
      btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this._handleNavigate(btn.dataset.page); });
    });
  }
}

customElements.define('app-hamburger', AppHamburger);
