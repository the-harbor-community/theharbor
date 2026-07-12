import { subscribe, getState, navigateTo, t, toggleTheme, openMobileMenu, openSidebar } from '../store.js';
import { db } from '../firebase.js';
import { collection, query, where, onSnapshot } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

function getIconSvg(id, isActive = false) {
  const stroke = "currentColor";
  const fill = isActive ? "currentColor" : "none";
  switch (id) {
    case 'feed':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>`;
    case 'submit':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/>
      </svg>`;
    case 'profile':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>`;
    case 'activity':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>`;
    case 'notifications':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
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
    case 'about':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
        <path d="M12 16v-4"/>
        <path d="M12 8h.01"/>
      </svg>`;
    case 'admin':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/>
        <rect x="5" y="16" width="14" height="4" rx="1"/>
      </svg>`;
    case 'admin-bugs':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>`;
    default:
      return '';
  }
}

function getThemeIconSvg(theme) {
  const stroke = "currentColor";
  switch (theme) {
    case 'dark':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
      </svg>`;
    case 'deep-sea':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
        <path d="M2 6c.6 0 1.2-.2 1.6-.6L5 4.2c.8-.8 2-.8 2.8 0l1.6 1.6c.4.4 1 .6 1.6.6s1.2-.2 1.6-.6l1.6-1.6c.8-.8 2-.8 2.8 0l1.6 1.6c.4.4 1 .6 1.6.6"/>
        <path d="M2 12c.6 0 1.2-.2 1.6-.6l1.6-1.6c.8-.8 2-.8 2.8 0l1.6 1.6c.4.4 1 .6 1.6.6s1.2-.2 1.6-.6l1.6-1.6c.8-.8 2-.8 2.8 0l1.6 1.6c.4.4 1 .6 1.6.6"/>
      </svg>`;
    case 'green-theme':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 3.5 2 5.5a7 7 0 0 1-7 7h-3"/>
      </svg>`;
    case 'black':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10"/>
      </svg>`;
    default:
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2"/>
        <path d="M12 20v2"/>
        <path d="M4.93 4.93l1.41 1.41"/>
        <path d="M17.57 17.57l1.41 1.41"/>
        <path d="M2 12h2"/>
        <path d="M20 12h2"/>
      </svg>`;
  }
}

function getUserIconSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block; width:1.25rem; height:1.25rem;">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`;
}

const template = document.createElement('template');
template.innerHTML = `
<style>
  *[hidden] { display: none !important; }
  :host {
    display: block;
    position: sticky;
    top: 0;
    z-index: 200;
  }
  header {
    position: relative; width: 100%; height: 4rem;
    background: var(--color-card); color: var(--text-primary);
    display: flex; align-items: center; justify-content: space-between;
    gap: 0.5rem; padding: 0 1rem; border-bottom: 1px solid var(--color-border);
    box-shadow: var(--shadow-sm); overflow: visible;
    box-sizing: border-box;
  }
  @media (min-width: 768px) {
    header {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      padding: 0 1.25rem;
      justify-content: stretch;
    }
    .logo { grid-column: 1; }
    .nav-desktop { grid-column: 2; grid-row: 1; justify-self: center; }
    .actions { grid-column: 3; justify-self: end; max-width: none; }
    .user-block { justify-content: flex-end; }
    .user-text { max-width: 14rem; }
  }
  .logo {
    display: flex; align-items: center; gap: 0.625rem; background: none; border: none;
    cursor: pointer; color: inherit; padding: 0.375rem; border-radius: 0.75rem;
    transition: opacity 0.15s, transform 0.15s cubic-bezier(0.4, 0, 0.2, 1); flex-shrink: 0;
  }
  .logo:hover { opacity: 0.9; }
  .logo:active { transform: scale(0.95); }
  .logo-icon {
    width: 2.5rem; height: 2.5rem; border-radius: 0.75rem; background: var(--color-primary);
    color: #fff; font-size: 1.25rem; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.2); animation: floatGentle 4s ease-in-out infinite;
  }
  .logo-the { font-size: 0.625rem; font-weight: 900; letter-spacing: 0.15em; color: var(--color-primary); text-transform: uppercase; line-height: 1; }
  .logo-name { font-size: 1.125rem; font-weight: 800; color: var(--text-primary); line-height: 1; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.1)); }
  .logo-text { display: flex; flex-direction: column; line-height: 1; text-align: left; }
  .nav-mobile-wrap {
    position: relative; display: flex; align-items: center; flex: 1;
    max-width: 130px; margin: 0 0.25rem; overflow: visible;
  }
  @media (min-width: 350px) { .nav-mobile-wrap { max-width: 190px; } }
  @media (min-width: 400px) { .nav-mobile-wrap { max-width: 250px; } }
  @media (min-width: 640px) { .nav-mobile-wrap { max-width: 20rem; } }
  @media (min-width: 768px) { .nav-mobile-wrap { display: none; } }
  .nav-mobile {
    position: relative;
    display: flex; align-items: center; gap: 0.375rem; overflow-x: auto;
    padding: 0.375rem 0.5rem; background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border-radius: 9999px; border: 1.5px solid rgba(251, 191, 36, 0.6);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    flex: 1; scroll-behavior: smooth; -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
  }
  .nav-mobile:hover {
    border-color: rgba(251, 191, 36, 0.9);
    box-shadow: 0 6px 24px rgba(251, 191, 36, 0.2), 0 4px 20px rgba(0, 0, 0, 0.4);
  }
  .nav-mobile::-webkit-scrollbar { display: none; }
  .nav-mobile-btn {
    flex-shrink: 0; display: flex; align-items: center; justify-content: center; gap: 0.25rem;
    padding: 0.375rem 0.625rem; border-radius: 9999px; border: none; cursor: pointer;
    font-size: 0.75rem; font-weight: 700; background: transparent; color: #cbd5e1;
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s, color 0.2s;
    position: relative; white-space: nowrap;
    z-index: 2;
  }
  .nav-mobile-btn.active, .nav-mobile-btn.is-active {
    color: #0f172a !important; font-weight: 800;
    transform: scale(1.06);
  }
  .nav-mobile-capsule {
    position: absolute;
    border-radius: 9999px;
    background: #fbbf24;
    box-shadow: 0 4px 12px rgba(251, 191, 36, 0.35);
    transition: left 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), height 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease-in-out;
    will-change: left, width, top, height;
    pointer-events: none;
    z-index: 1;
    opacity: 0;
  }
  .nav-mobile-btn:active {
    transform: scale(0.92);
  }
  .nav-mobile-btn.clicked { animation: scalePop 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
  .nav-mobile-btn .icon { font-size: 0.875rem; }
  .nav-mobile-btn .label { font-size: 0.625rem; display: none; }
  @media (min-width: 350px) { .nav-mobile-btn .label { display: inline; } }
  .swipe-hint {
    position: absolute; right: 0.5rem; display: flex; align-items: center; gap: 0.125rem;
    font-size: 0.5rem; font-weight: 900; color: var(--text-secondary); pointer-events: none;
    background: linear-gradient(to left, var(--bg-primary), rgba(var(--bg-primary), 0.95), transparent);
    padding: 0.25rem 0.25rem 0.25rem 1.25rem; border-radius: 0 9999px 9999px 0;
    animation: pulse 2s ease-in-out infinite;
  }
  .nav-desktop {
    display: none; align-items: center; justify-content: center; gap: 0.375rem;
    padding: 0.375rem 0.625rem; max-width: 100%; min-width: 0; justify-self: center;
    background: var(--bg-secondary); border-radius: 9999px; border: 1px solid var(--color-border);
    box-shadow: var(--shadow-sm); flex-wrap: nowrap; white-space: nowrap;
    overflow-x: auto; scrollbar-width: none;
    position: relative;
  }
  .nav-desktop::-webkit-scrollbar { display: none; }
  @media (min-width: 768px) { .nav-desktop { display: inline-flex; } }
  .nav-btn {
    width: 2.25rem; height: 2.25rem; border-radius: 9999px; border: none; cursor: pointer;
    background: transparent; font-size: 1.125rem; position: relative;
    display: flex; align-items: center; justify-content: center;
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), background 0.15s, box-shadow 0.15s;
    color: var(--text-secondary);
    z-index: 2;
  }
  .nav-btn:hover { background: var(--color-card); box-shadow: var(--shadow-sm); }
  .nav-btn.active, .nav-btn.is-active { color: #fff; transform: scale(1.05); }
  .nav-desktop-capsule {
    position: absolute;
    border-radius: 9999px;
    background: var(--color-primary);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
    transition: left 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), height 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease-in-out;
    will-change: left, width, top, height;
    pointer-events: none;
    z-index: 1;
    opacity: 0;
  }
  .nav-btn.clicked { animation: scalePop 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
  .nav-btn .tooltip {
    position: absolute; top: 3rem; transform: scale(0); background: #0f172a; color: #fff;
    font-size: 0.625rem; padding: 0.25rem 0.625rem; border-radius: 0.25rem;
    box-shadow: var(--shadow-md); white-space: nowrap; z-index: 250; pointer-events: none;
    font-weight: 700; transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .nav-btn:hover .tooltip { transform: scale(1); }
  .badge {
    position: absolute; top: -0.375rem; right: -0.375rem; background: var(--color-danger); color: #fff;
    font-size: 0.5625rem; font-weight: 700; border-radius: 9999px;
    min-width: 1.125rem; height: 1.125rem; display: flex; align-items: center; justify-content: center;
    box-shadow: var(--shadow-sm); animation: scalePop 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .hamburger-btn {
    display: flex; align-items: center; justify-content: center;
    width: 2.5rem; height: 2.5rem; background: var(--bg-secondary, rgba(255, 255, 255, 0.05));
    border: 2px solid #fbbf24; cursor: pointer;
    font-size: 1.375rem; font-weight: 900; color: #fbbf24; border-radius: 0.75rem;
    transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), background 0.15s;
    position: relative;
    z-index: 999 !important;
    box-sizing: border-box;
    flex-shrink: 0 !important;
    animation: goldBlinkAnimation 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  @keyframes goldBlinkAnimation {
    0%, 100% {
      border-color: #fbbf24;
      box-shadow: 0 0 4px rgba(251, 191, 36, 0.4), inset 0 0 2px rgba(251, 191, 36, 0.2);
    }
    50% {
      border-color: #f59e0b;
      box-shadow: 0 0 16px rgba(245, 158, 11, 0.95), inset 0 0 6px rgba(245, 158, 11, 0.5);
    }
  }
  @media (min-width: 768px) { .hamburger-btn { display: none; } }
  .hamburger-btn:hover { background: var(--color-border); }
  .hamburger-btn:active { transform: scale(0.9); }
  .bug-pulse {
    position: absolute; top: 0.5rem; right: 0.5rem; width: 0.75rem; height: 0.75rem;
    background: #ef4444; border-radius: 9999px; animation: pulse 2s ease-in-out infinite; z-index: 20;
  }
  /* 🔥 FIX: Prevent header cut-off – allow content to expand */
  .actions {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-shrink: 0;
    min-width: 0;
    max-width: 100%;
    overflow: visible; /* was 'hidden' – no longer cuts off */
  }
  @media (min-width: 480px) {
    .actions {
      gap: 0.5rem;
    }
  }
  .theme-btn {
    width: 2.25rem; height: 2.25rem; border-radius: 9999px; border: 1px solid var(--color-border);
    background: transparent; cursor: pointer; font-size: 1rem;
    display: none;
    align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), background 0.15s;
  }
  @media (min-width: 768px) { .theme-btn { display: flex; } }
  .theme-btn:active { transform: scale(0.95); }
  .user-block {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: flex-end;
    min-width: 0;
    max-width: 100%;
    cursor: pointer;
    overflow: visible; /* was 'hidden' */
  }
  .user-text {
    text-align: right;
    line-height: 1.2;
    min-width: 0;
    max-width: 14rem; /* increased from 10rem to avoid cutting long names */
    overflow: hidden;
  }
  @media (max-width: 767px) {
    .user-text { display: none !important; }
  }
  .user-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .online-dot { position: relative; display: inline-block; width: 0.5rem; height: 0.5rem; flex-shrink: 0; }
  .online-dot .ping { position: absolute; inset: 0; border-radius: 9999px; background: #34d399; opacity: 0.75; animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite; }
  .online-dot .dot { position: relative; display: inline-flex; width: 0.5rem; height: 0.5rem; border-radius: 9999px; background: #10b981; }
  .user-status {
    font-size: 0.625rem;
    color: #059669;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .user-avatar {
    width: 2.25rem;
    height: 2.25rem;
    flex-shrink: 0;
    background: rgba(16, 185, 129, 0.1);
    border-radius: 9999px;
    border: 2px solid rgba(16, 185, 129, 0.2);
    display: flex;
    align-items: center; justify-content: center;
    font-size: 1.25rem;
    box-shadow: var(--shadow-sm);
  }
  @media (max-width: 767px) {
    .user-avatar { display: none !important; }
  }
  .auth-btn {
    padding: 0.375rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700;
    cursor: pointer; font-family: inherit;
    transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), background 0.15s, filter 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
  }
  @media (min-width: 480px) {
    .auth-btn {
      padding: 0.375rem 1rem;
    }
  }
  .auth-btn--login { background: transparent; border: 1px solid var(--color-border); color: var(--text-secondary); }
  .auth-btn--login:hover { background: var(--bg-secondary); }
  .auth-btn--signup { background: var(--color-primary); border: none; color: #fff; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2); }
  .auth-btn--signup:hover { filter: brightness(1.1); }
  .auth-btn--signup:active { transform: scale(0.95); }
  @keyframes floatGentle { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
  @keyframes scalePop { 0% { transform: scale(0.85); opacity: 0.8; } 100% { transform: scale(1); opacity: 1; } }
  @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  @keyframes bounceH { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(4px); } }
  .bounce-h { animation: bounceH 1s ease-in-out infinite; display: inline-block; }
  
  @keyframes neonPulse {
    0%, 100% {
      box-shadow: 0 0 10px #fbbf24, 0 0 20px #fbbf24;
      transform: scale(1.05);
    }
    50% {
      box-shadow: 0 0 20px #fbbf24, 0 0 35px #fbbf24;
      transform: scale(1.15);
    }
  }
  .notif-glowing {
    animation: neonPulse 0.8s ease-in-out infinite !important;
    border: 2px solid #fbbf24 !important;
    background: #0f172a !important;
    color: #fbbf24 !important;
    z-index: 10;
  }
</style>
<header role="banner">
  <button class="logo" id="logo-btn" aria-label="The Harbor Home">
    <div class="logo-icon">
      <span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
          <circle cx="12" cy="5" r="3"/>
          <line x1="12" x2="12" y1="8" y2="22"/>
          <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
        </svg>
      </span>
    </div>
    <div class="logo-text"><span class="logo-the">The</span><span class="logo-name">Harbor</span></div>
  </button>
  <div class="nav-mobile-wrap" id="nav-mobile-wrap" hidden>
    <nav class="nav-mobile" id="nav-mobile" role="navigation" aria-label="Mobile Navigation">
      <div class="nav-mobile-capsule"></div>
      <div class="nav-mobile-inner" id="nav-mobile-inner" style="display:flex; align-items:center; gap:0.375rem; flex:1;"></div>
    </nav>
    <div class="swipe-hint" id="swipe-hint"><span>Swipe</span><span class="bounce-h">→</span></div>
  </div>
  <nav class="nav-desktop" id="nav-desktop" role="navigation" aria-label="Main Navigation" hidden>
    <div class="nav-desktop-capsule"></div>
    <div class="nav-desktop-inner" id="nav-desktop-inner" style="display:flex; align-items:center; gap:0.375rem; width:100%; height:100%;"></div>
  </nav>
  <button class="hamburger-btn" id="hamburger-btn" aria-label="Toggle Hamburger Menu" hidden>☰</button>
  <div class="actions" id="actions"></div>
</header>
`;

class AppNavigation extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._unreadNotifs = 0;
    this._pendingBugs = 0;
    this._hasNewBugFix = false;
    this._clickedTab = null;
    this._hasScrolled = false;
    this._unsubs = [];
    this._notifAlertActive = false;
    this._isFirstSnapshot = true;
    this._alertTimeout = null;
  }

  connectedCallback() {
    this.shadowRoot.getElementById('logo-btn').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const { user } = getState();
      if (!user) {
        navigateTo('welcome');
      } else {
        this._handleTabClick('feed');
      }
    });
    this.shadowRoot.getElementById('hamburger-btn').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openMobileMenu(); });
    const navMobile = this.shadowRoot.getElementById('nav-mobile');
    navMobile.addEventListener('scroll', () => {
      this._hasScrolled = true;
      const hint = this.shadowRoot.getElementById('swipe-hint');
      if (hint) hint.hidden = true;
    });
    subscribe('user', () => { this._setupListeners(); this._render(); });
    subscribe('userData', () => this._render());
    subscribe('theme', () => this._render());
    subscribe('language', () => this._render());
    window.addEventListener('harbor:route', () => { this._renderNav(); });
    
    this._resizeHandler = () => this._renderNav();
    window.addEventListener('resize', this._resizeHandler);

    this._render();
    this._setupListeners();
  }

  disconnectedCallback() {
    this._unsubs.forEach(u => u());
    this._unsubs = [];
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
    }
  }

  _detectPage() {
    const hash = window.location.hash || '';
    const cleanHash = hash.replace(/^#\/?/, '').split('?')[0];
    if (cleanHash) {
      const map = {
        'index.html': 'feed', 'welcome.html': 'welcome', 'story.html': 'story',
        'profile.html': 'profile', 'submit.html': 'submit', 'activity.html': 'activity',
        'notifications.html': 'notifications', 'leaderboard.html': 'leaderboard',
        'daily-rewards.html': 'daily-rewards', 'about.html': 'about', 'admin.html': 'admin',
        'admin-bugs.html': 'admin-bugs', 'delete-account.html': 'delete-account',
      };
      return map[cleanHash] || cleanHash;
    }
    const path = window.location.pathname.split('/').pop() || 'index.html';
    const map = {
      'index.html': 'feed', 'welcome.html': 'welcome', 'story.html': 'story',
      'profile.html': 'profile', 'submit.html': 'submit', 'activity.html': 'activity',
      'notifications.html': 'notifications', 'leaderboard.html': 'leaderboard',
      'daily-rewards.html': 'daily-rewards', 'about.html': 'about', 'admin.html': 'admin',
      'admin-bugs.html': 'admin-bugs', 'delete-account.html': 'delete-account',
    };
    return map[path] || path.replace('.html', '') || 'feed';
  }

  _getProfileUid() {
    const hash = window.location.hash || '';
    const questionIdx = hash.indexOf('?');
    if (questionIdx !== -1) {
      const queryStr = hash.slice(questionIdx + 1);
      const val = new URLSearchParams(queryStr).get('uid');
      if (val !== null) return val;
    }
    return new URLSearchParams(window.location.search).get('uid');
  }

  _setupListeners() {
    const { user, userData } = getState();
    const currentUid = user?.uid || null;
    const currentIsAdmin = !!userData?.isAdmin;

    // If user and admin status are unchanged, and we already have listeners, DO NOT recreate them!
    if (this._activeUserUid === currentUid && this._activeAdminState === currentIsAdmin && this._unsubs.length > 0) {
      return;
    }

    this._unsubs.forEach(u => u());
    this._unsubs = [];
    this._activeUserUid = currentUid;
    this._activeAdminState = currentIsAdmin;

    if (!user) {
      this._hasNewBugFix = false;
      this._unreadNotifs = 0;
      this._pendingBugs = 0;
      return;
    }

    const notifQ = query(collection(db, 'notifications'), where('toUid', '==', user.uid), where('read', '==', false));
    this._isFirstSnapshot = true;
    this._unsubs.push(onSnapshot(notifQ, (snapshot) => {
      const prevCount = this._unreadNotifs;
      this._unreadNotifs = snapshot.size;
      this._renderNav();
      this._renderHamburgerBadge();

      if (this._isFirstSnapshot) {
        this._isFirstSnapshot = false;
        if (this._unreadNotifs > 0) {
          this._triggerNotifAlert();
        }
      } else {
        if (this._unreadNotifs > prevCount) {
          this._triggerNotifAlert();
        }
      }
    }, (err) => console.warn('Notifications real-time count error:', err)));

    if (userData?.isAdmin) {
      const bugsQ = query(collection(db, 'bugs'), where('status', '==', 'pending'));
      this._unsubs.push(onSnapshot(bugsQ, (snapshot) => {
        this._pendingBugs = snapshot.size;
        this._renderNav();
        this._renderHamburgerBadge();
      }, (err) => console.warn('Bugs count real-time error:', err)));
    }
  }

  _triggerNotifAlert() {
    this._notifAlertActive = true;
    this._renderNav();
    
    // Auto-scroll the active notification tab into center view of the mobile bottom nav container
    setTimeout(() => {
      const navMobile = this.shadowRoot.getElementById('nav-mobile');
      const notifBtn = navMobile?.querySelector('[data-page="notifications"]');
      if (navMobile && notifBtn) {
        const containerWidth = navMobile.clientWidth;
        const btnLeft = notifBtn.offsetLeft;
        const btnWidth = notifBtn.clientWidth;
        const scrollTarget = btnLeft - (containerWidth / 2) + (btnWidth / 2);
        navMobile.scrollTo({ left: scrollTarget, behavior: 'smooth' });
      }
    }, 100);

    if (this._alertTimeout) clearTimeout(this._alertTimeout);
    this._alertTimeout = setTimeout(() => {
      this._notifAlertActive = false;
      this._renderNav();
    }, 5000);
  }

  _handleTabClick(page, params) {
    this._clickedTab = page;
    setTimeout(() => { this._clickedTab = null; this._renderNav(); }, 600);
    if (page === 'profile' && params?.uid) navigateTo('profile', { uid: params.uid });
    else if (page === 'feed') navigateTo('feed');
    else navigateTo(page);
    this._renderNav();
  }

  _pageHref(page, params) {
    if (page === 'feed') return 'index.html';
    if (page === 'profile') return `profile.html?uid=${encodeURIComponent(params?.uid || getState().user?.uid || '')}`;
    return `${page}.html`;
  }

  _isActive(tabId) {
    const currentPage = this._detectPage();
    const profileUid = this._getProfileUid();
    const user = getState().user;
    if (tabId === 'profile') return currentPage === 'profile' && profileUid === user?.uid;
    return currentPage === tabId;
  }

  _syncActiveNavigation() {
    const currentPage = this._detectPage();
    const allBtns = this.shadowRoot.querySelectorAll('.nav-mobile-btn, .nav-btn, .nav-item');
    allBtns.forEach(btn => {
      btn.classList.remove('active', 'is-active');
      btn.removeAttribute('aria-current');
    });

    const matchingBtns = this.shadowRoot.querySelectorAll(`[data-page="${currentPage}"]`);
    matchingBtns.forEach(btn => {
      btn.classList.add('active', 'is-active');
      btn.setAttribute('aria-current', 'page');
    });

    const navMobile = this.shadowRoot.getElementById('nav-mobile');
    const navDesktop = this.shadowRoot.getElementById('nav-desktop');
    const mobileCapsule = navMobile?.querySelector('.nav-mobile-capsule');
    const desktopCapsule = navDesktop?.querySelector('.nav-desktop-capsule');

    requestAnimationFrame(() => {
      const activeMobileBtn = navMobile?.querySelector('.nav-mobile-btn.is-active');
      if (activeMobileBtn && mobileCapsule) {
        mobileCapsule.style.top = `${activeMobileBtn.offsetTop}px`;
        mobileCapsule.style.left = `${activeMobileBtn.offsetLeft}px`;
        mobileCapsule.style.width = `${activeMobileBtn.offsetWidth}px`;
        mobileCapsule.style.height = `${activeMobileBtn.offsetHeight}px`;
        mobileCapsule.style.opacity = '1';
      } else if (mobileCapsule) {
        mobileCapsule.style.opacity = '0';
      }

      const activeDesktopBtn = navDesktop?.querySelector('.nav-btn.is-active');
      if (activeDesktopBtn && desktopCapsule) {
        desktopCapsule.style.top = `${activeDesktopBtn.offsetTop}px`;
        desktopCapsule.style.left = `${activeDesktopBtn.offsetLeft}px`;
        desktopCapsule.style.width = `${activeDesktopBtn.offsetWidth}px`;
        desktopCapsule.style.height = `${activeDesktopBtn.offsetHeight}px`;
        desktopCapsule.style.opacity = '1';
      } else if (desktopCapsule) {
        desktopCapsule.style.opacity = '0';
      }
    });
  }

  _renderHamburgerBadge() {
    const btn = this.shadowRoot.getElementById('hamburger-btn');
    if (!btn) return;
    btn.querySelectorAll('.badge, .bug-pulse').forEach(el => el.remove());
    if (this._pendingBugs > 0) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = String(this._pendingBugs);
      btn.appendChild(badge);
    }
  }

  _renderNav() {
    const { user } = getState();
    if (!user) return;

    const mobileTabs = [
      { id: 'feed', label: t('home', 'Home'), params: undefined },
      { id: 'submit', label: t('share_story', 'Share Story'), params: undefined },
      { id: 'profile', label: t('profile', 'Profile'), params: { uid: user.uid } },
      { id: 'notifications', label: t('nav_alerts', 'Alerts'), badge: this._unreadNotifs, params: undefined },
    ];

    const desktopTabs = [
      { id: 'feed', label: t('home', 'Home') },
      { id: 'submit', label: t('share', 'Share') },
      { id: 'profile', label: t('profile', 'Profile'), params: { uid: user.uid } },
      { id: 'activity', label: t('activity', 'Activity') },
      { id: 'notifications', label: t('nav_alerts', 'Alerts'), badge: this._unreadNotifs },
      { id: 'leaderboard', label: t('nav_top', 'Top') },
      { id: 'daily-rewards', label: t('nav_daily', 'Daily') },
      { id: 'about', label: t('nav_about', 'About') },
      ...(getState().userData?.isAdmin ? [{ id: 'admin', label: t('admin', 'Admin') }] : []),
      { id: 'admin-bugs', label: t('nav_bugs', 'Bugs'), badge: this._pendingBugs },
    ];

    const navMobile = this.shadowRoot.getElementById('nav-mobile');
    const navMobileInner = this.shadowRoot.getElementById('nav-mobile-inner');
    if (!navMobile || !navMobileInner) return;

    navMobileInner.innerHTML = mobileTabs.map(tab => {
      const active = this._isActive(tab.id);
      const clicked = this._clickedTab === tab.id;
      const glowing = tab.id === 'notifications' && this._notifAlertActive;
      const badge = tab.badge > 0 ? `<span class="badge">${tab.badge}</span>` : '';
      const svgIcon = getIconSvg(tab.id, active);
      return `<button type="button" class="nav-mobile-btn nav-item${active ? ' active is-active' : ''}${clicked ? ' clicked' : ''}${glowing ? ' notif-glowing' : ''}" data-page="${tab.id}" data-href="${this._pageHref(tab.id, tab.params)}" aria-current="${active ? 'page' : 'false'}" title="${tab.label}"><span class="icon">${svgIcon}</span><span class="label">${tab.label}</span>${badge}</button>`;
    }).join('');

    const navDesktop = this.shadowRoot.getElementById('nav-desktop');
    const navDesktopInner = this.shadowRoot.getElementById('nav-desktop-inner');
    if (!navDesktop || !navDesktopInner) return;

    navDesktopInner.innerHTML = desktopTabs.map(tab => {
      const active = this._isActive(tab.id);
      const clicked = this._clickedTab === tab.id;
      const badge = tab.badge > 0 ? `<span class="badge">${tab.badge}</span>` : '';
      const svgIcon = getIconSvg(tab.id, active);
      return `<button type="button" class="nav-btn nav-item${active ? ' active is-active' : ''}${clicked ? ' clicked' : ''}" data-page="${tab.id}" data-href="${this._pageHref(tab.id, tab.params)}" aria-current="${active ? 'page' : 'false'}" title="${tab.label}"><span>${svgIcon}${badge}</span><span class="tooltip">${tab.label}</span></button>`;
    }).join('');

    this._syncActiveNavigation();

    [...navMobileInner.querySelectorAll('button'), ...navDesktopInner.querySelectorAll('button')].forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const page = btn.dataset.page;
        const params = page === 'profile' ? { uid: getState().user.uid } : undefined;
        this._handleTabClick(page, params);
      });
    });
    this._renderHamburgerBadge();
  }

  _render() {
    const { user, userData, theme } = getState();
    const navMobileWrap = this.shadowRoot.getElementById('nav-mobile-wrap');
    const navMobile = this.shadowRoot.getElementById('nav-mobile');
    const navDesktop = this.shadowRoot.getElementById('nav-desktop');
    const hamburger = this.shadowRoot.getElementById('hamburger-btn');
    const actions = this.shadowRoot.getElementById('actions');
    const swipeHint = this.shadowRoot.getElementById('swipe-hint');

    if (user) {
      navMobileWrap.hidden = false;
      navDesktop.hidden = false;
      hamburger.hidden = false;
      swipeHint.hidden = this._hasScrolled;
      this._renderNav();
      const themeIconSvg = getThemeIconSvg(theme);
      actions.innerHTML = `
        <div class="user-block" id="user-block" role="button" tabindex="0" aria-label="${t('open_settings', 'Open settings')}">
          <button class="theme-btn" id="theme-btn" title="${t('change_theme', 'Change Theme')}">${themeIconSvg}</button>
          <div class="user-text">
            <p class="user-name">${userData?.name || 'Friend'}
              <span class="online-dot"><span class="ping"></span><span class="dot"></span></span>
            </p>
            <p class="user-status">${userData?.isAdmin ? t('role_admin', 'Admin') : user.emailVerified ? t('role_verified', 'Verified') : t('role_friend', 'Friend')}</p>
          </div>
          <div class="user-avatar">${userData?.avatar || getUserIconSvg()}</div>
        </div>`;
      const userBlock = this.shadowRoot.getElementById('user-block');
      const openSettings = (e) => { e.preventDefault(); e.stopPropagation(); openSidebar(); };
      userBlock?.addEventListener('click', openSettings);
      userBlock?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSidebar(); } });
      this.shadowRoot.getElementById('theme-btn')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleTheme(); });
    } else {
      navMobileWrap.hidden = true;
      navDesktop.hidden = true;
      hamburger.hidden = true;
      if (swipeHint) swipeHint.hidden = true;
      const navMobileInner = this.shadowRoot.getElementById('nav-mobile-inner');
      const navDesktopInner = this.shadowRoot.getElementById('nav-desktop-inner');
      if (navMobileInner) navMobileInner.innerHTML = '';
      if (navDesktopInner) navDesktopInner.innerHTML = '';
      actions.innerHTML = `
        <button class="auth-btn auth-btn--login" id="login-btn">${t('login', 'Log In')}</button>
        <button class="auth-btn auth-btn--signup" id="signup-btn">${t('signup', 'Join')}</button>`;
      this.shadowRoot.getElementById('login-btn')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); window.openAuthModal('login'); });
      this.shadowRoot.getElementById('signup-btn')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); window.openAuthModal('signup'); });
    }
  }
}

customElements.define('app-navigation', AppNavigation);