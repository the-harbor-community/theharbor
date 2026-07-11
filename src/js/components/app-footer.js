import { subscribe, t, navigateTo, getState, showToast } from '../store.js';
import { auth } from '../firebase.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host { display: block; margin-top: auto; }
  footer {
    background: var(--color-card); border-top: 1px solid var(--color-border);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  /* Compact Footer Styling */
  .compact-footer {
    padding: 1.5rem 1rem;
    text-align: center;
    background: var(--bg-primary); /* Blend with login page perfectly */
  }
  .compact-footer .footer-bottom {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }
  .status-ping {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--color-success);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.25rem 0.625rem;
    background: rgba(16, 185, 129, 0.1);
    border-radius: 9999px;
    border: 1px solid rgba(16, 185, 129, 0.2);
  }
  .ping-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 9999px;
    background: var(--color-success);
    animation: pingPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
  .compact-links {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }
  .divider {
    color: var(--text-muted);
    font-size: 0.75rem;
  }
  
  /* Dense Footer Styling */
  .dense-footer {
    padding: 3rem 1.5rem 1.5rem;
  }
  .footer-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2rem;
    max-width: 80rem;
    margin: 0 auto 2.5rem;
    text-align: left;
  }
  @media (min-width: 768px) {
    .footer-grid {
      grid-template-columns: 2fr 1fr 1fr;
    }
  }
  .footer-col {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .col-title {
    font-size: 0.75rem;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-primary);
    margin: 0;
  }
  .philosophy-text {
    font-size: 0.75rem;
    color: var(--text-secondary);
    line-height: 1.6;
    margin: 0;
  }
  .grid-links {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }
  .identity-badge-wrap {
    background: var(--bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 0.75rem;
  }
  .identity-badge {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }
  .user-avatar-placeholder {
    font-size: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: var(--color-card);
    border-radius: 9999px;
    border: 1px solid var(--color-border);
  }
  .user-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .user-name {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .user-role-tag {
    font-size: 0.625rem;
    color: var(--text-muted);
    font-weight: 500;
  }
  
  .footer-btn {
    width: 100%;
    padding: 0.5rem;
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 700;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: transform 0.15s, filter 0.15s;
    border: none;
  }
  .btn-signout {
    background: var(--bg-secondary);
    border: 1px solid var(--color-danger);
    color: var(--color-danger);
  }
  .btn-signout:hover {
    background: var(--color-danger);
    color: #fff;
  }
  .btn-signout:active {
    transform: scale(0.95);
  }
  
  /* Shared elements */
  .footer-link {
    background: none; border: none; cursor: pointer; font-family: inherit;
    color: var(--text-muted); font-weight: 600; font-size: 0.75rem;
    transition: color 0.15s; text-align: left; padding: 0.125rem 0;
  }
  .footer-link:hover { color: var(--color-primary); }
  .copy { color: var(--text-muted); font-size: 0.6875rem; font-weight: 500; margin: 0; }
  
  .footer-bottom-bar {
    border-top: 1px solid var(--color-border);
    padding-top: 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    max-width: 80rem;
    margin: 0 auto;
  }
  @media (min-width: 768px) {
    .footer-bottom-bar {
      flex-direction: row;
      justify-content: space-between;
    }
  }
  
  @keyframes pingPulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.15); opacity: 0.75; }
  }

  @media (max-width: 767px) {
    .dense-footer {
      padding: 1rem 0.75rem !important;
    }
    .compact-footer {
      padding: 0.75rem 0.5rem !important;
    }
    .footer-grid {
      gap: 1rem !important;
      margin-bottom: 1.25rem !important;
    }
    .col-title {
      font-size: 0.6875rem !important;
    }
    .philosophy-text {
      font-size: 0.6875rem !important;
      line-height: 1.4 !important;
    }
    .footer-link {
      font-size: 0.6875rem !important;
    }
    .copy {
      font-size: 0.625rem !important;
    }
    .footer-bottom-bar {
      padding-top: 0.75rem !important;
      gap: 0.5rem !important;
    }
    .identity-badge-wrap {
      padding: 0.5rem !important;
    }
    .user-avatar-placeholder {
      width: 1.75rem !important;
      height: 1.75rem !important;
      font-size: 1rem !important;
    }
    .user-name {
      font-size: 0.6875rem !important;
    }
    .footer-btn {
      padding: 0.375rem !important;
      font-size: 0.6875rem !important;
    }
  }
</style>
<div id="footer-container"></div>
`;

function getFooterIconSvg(type) {
  const stroke = "currentColor";
  switch (type) {
    case 'anchor':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left: 4px;">
        <circle cx="12" cy="5" r="3"/>
        <line x1="12" x2="12" y1="8" y2="22"/>
        <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
      </svg>`;
    case 'heart':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right: 4px; color: var(--color-success);">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
      </svg>`;
    case 'crown':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right: 4px;">
        <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/>
      </svg>`;
    case 'user':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>`;
    case 'logout':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right: 6px;">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" x2="9" y1="12" y2="12"/>
      </svg>`;
    default:
      return '';
  }
}

class AppFooter extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    subscribe('language', () => this._render());
    subscribe('user', () => this._render());
    subscribe('currentScreen', () => this._render());

    this.shadowRoot.addEventListener('click', (e) => {
      const btn = e.target.closest('.footer-link');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const page = btn.dataset.page;
      if (page) navigateTo(page);
    });

    this._render();
  }

  _escape(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
  }

  _render() {
    const s = this.shadowRoot;
    const { user, userData } = getState();
    
    // Check if authenticated
    if (user) {
      // Authenticated Application Context
      const userName = userData?.name || user.displayName || 'Friend';
      const userRole = userData?.isAdmin ? `${getFooterIconSvg('crown')} Admin` : `${getFooterIconSvg('anchor')} Member`;
      s.getElementById('footer-container').innerHTML = `
        <footer role="contentinfo" class="dense-footer">
          <div class="footer-grid">
            <!-- Column 1: Philosophy / Gateway -->
            <div class="footer-col brand-col">
              <h4 class="col-title">${t('app_name', 'The Harbor')} ${getFooterIconSvg('anchor')}</h4>
              <p class="philosophy-text">
                ${t('philosophy_text', 'A safe, anonymous space to share stories, seek comfort, and support one another on the journey of healing. Built with compassion for the global community.')}
              </p>
            </div>
            
            <!-- Column 2: Navigation Links Matrix -->
            <div class="footer-col links-col">
              <h4 class="col-title">${t('navigate_title', 'Navigate')}</h4>
              <nav class="grid-links">
                <button class="footer-link" data-page="feed">${t('nav_feed', 'Feed')}</button>
                <button class="footer-link" data-page="submit">${t('nav_share', 'Share Story')}</button>
                <button class="footer-link" data-page="profile">${t('nav_profile', 'Profile')}</button>
                <button class="footer-link" data-page="suggest">${t('footer_suggest', 'Suggest')}</button>
                <button class="footer-link" data-page="donate" style="display:inline-flex; align-items:center;">${getFooterIconSvg('heart')}${t('donate_title', 'Donate')}</button>
                <button class="footer-link" data-page="emergency">${t('emergency', 'Emergency')}</button>
              </nav>
            </div>

            <!-- Column 3: User Identity & Sign-out Trigger -->
            <div class="footer-col identity-col">
              <h4 class="col-title">${t('identity_title', 'Your Presence')}</h4>
              <div class="identity-badge-wrap">
                <div class="identity-badge">
                  <span class="user-avatar-placeholder">${userData?.avatar || getFooterIconSvg('user')}</span>
                  <div class="user-info">
                    <span class="user-name" id="user-name-display">${this._escape(userName)}</span>
                    <span class="user-role-tag" style="display:inline-flex; align-items:center; gap:0.25rem;">${userRole}</span>
                  </div>
                </div>
              </div>
              <button class="footer-btn btn-signout" id="footer-signout-btn" style="display:inline-flex; align-items:center; justify-content:center;">${getFooterIconSvg('logout')}${t('logout', 'Sign Out')}</button>
            </div>
          </div>
          
          <div class="footer-bottom-bar">
            <p class="copy">© ${new Date().getFullYear()} ${t('footer_copy', 'The Harbor — Built with 💚 for the community.')}</p>
            <div class="compact-links">
              <button class="footer-link" data-page="terms">${t('terms', 'Terms')}</button>
              <span class="divider">•</span>
              <button class="footer-link" data-page="privacy">${t('privacy', 'Privacy')}</button>
              <span class="divider">•</span>
              <button class="footer-link" data-page="donate" style="display:inline-flex; align-items:center;">${getFooterIconSvg('heart')}${t('donate_title', 'Donate')}</button>
            </div>
          </div>
        </footer>
      `;
      
      // Bind sign-out trigger
      const signoutBtn = s.getElementById('footer-signout-btn');
      if (signoutBtn) {
        signoutBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          try {
            await signOut(auth);
            showToast('🚪 Signed out successfully.', 'info');
            navigateTo('welcome');
          } catch (err) {
            showToast('Error signing out. Please try again.', 'error');
          }
        });
      }
    } else {
      // Logged Out (Login Page Context)
      s.getElementById('footer-container').innerHTML = `
        <footer role="contentinfo" class="compact-footer">
          <div class="footer-bottom">
            <div class="status-ping">
              <span class="ping-dot"></span>
              <span class="ping-text">${t('status_operational', 'Systems Operational')}</span>
            </div>
            <p class="copy">© ${new Date().getFullYear()} ${t('footer_copy', 'The Harbor — Built with 💚 for the community.')}</p>
            <div class="compact-links">
              <button class="footer-link" data-page="terms">${t('terms_of_service', 'Terms of Service')}</button>
              <span class="divider">•</span>
              <button class="footer-link" data-page="privacy">${t('privacy_policy', 'Privacy Policy')}</button>
              <span class="divider">•</span>
              <button class="footer-link" data-page="donate" style="display:inline-flex; align-items:center;">${getFooterIconSvg('heart')}${t('donate_title', 'Donate')}</button>
            </div>
          </div>
        </footer>
      `;
    }
  }
}
customElements.define('app-footer', AppFooter);
