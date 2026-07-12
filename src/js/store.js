import { locales } from './locales.js';

export const currentLang = 'en';

const listeners = new Map();
const state = {
  user: null,
  userData: null,
  authLoading: true,
  language: (() => {
    const l = localStorage.getItem('harbor_language') || 'en';
    return (l === 'us' || l === 'en-US') ? 'en' : l;
  })(),
  currentLang: 'en',
  theme: localStorage.getItem('harbor_theme') || 'dark',
  toasts: [],
  bookmarks: [],
  confirmModal: {
    isOpen: false,
    title: '',
    message: '',
    requireInput: false,
    callback: () => {},
    successMessage: '',
    confirmText: 'Yes',
    cancelText: 'Cancel',
  },
  sidebarOpen: false,
  menuOpen: false,
  shellReady: false,
  onboardingActive: false,
  onboardingStep: 0,
  showWelcomeGold: false,
  feedScrollY: 0,
  feedActiveCategory: sessionStorage.getItem('feed_active_category') || 'all',
  soundEnabled: localStorage.getItem('harbor_sound') !== 'false',
  currentScreen: null,
};

export function subscribe(key, callback) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(callback);
  return () => listeners.get(key)?.delete(callback);
}

function notify(key) {
  listeners.get(key)?.forEach((cb) => cb(getState()));
  listeners.get('*')?.forEach((cb) => cb(getState()));
}

export function getState() {
  return { ...state, userData: state.userData ? { ...state.userData } : null };
}

export function setUser(user) {
  if (state.user?.uid === user?.uid && state.user?.emailVerified === user?.emailVerified) return;
  state.user = user;
  notify('user');
  checkAndForceOnboarding();
}

export function setUserData(userData) {
  state.userData = userData;
  if (userData?.hasCompletedOnboarding === true) {
    localStorage.setItem('harbor_onboarded_complete', 'true');
  } else if (userData) {
    localStorage.removeItem('harbor_onboarded_complete');
  }
  if (userData?.language && userData.language !== state.language) {
    setLanguage(userData.language, false);
  }
  notify('userData');
  checkAndForceOnboarding();
}

export function setBookmarks(bookmarks) {
  state.bookmarks = bookmarks || [];
  try {
    localStorage.setItem('harbor_bookmarks', JSON.stringify(state.bookmarks));
  } catch (e) {
    console.error('Failed to save bookmarks to localStorage:', e);
  }
  notify('bookmarks');
}

export function patchUserData(partial) {
  if (!state.userData || !partial) return;
  state.userData = { ...state.userData, ...partial };
  notify('userData');
  checkAndForceOnboarding();
}

export function setAuthLoading(loading) {
  if (state.authLoading === loading) return;
  state.authLoading = loading;
  notify('authLoading');
  checkAndForceOnboarding();
}

export function setShellReady(ready = true) {
  state.shellReady = ready;
  notify('shellReady');
  checkAndForceOnboarding();
}

export function checkAndForceOnboarding() {
  if (state.authLoading || !state.user) return;
  if (!state.user.emailVerified) return;
  
  const isNewUser = sessionStorage.getItem('harbor_new_signup') === state.user.uid;
  const hasCompletedOnboarding = state.userData?.hasCompletedOnboarding === true || localStorage.getItem('harbor_onboarded_complete') === 'true';
  
  // If already onboarded, never show onboarding
  if (hasCompletedOnboarding) {
    state.onboardingActive = false;
    notify('onboarding');
    if (typeof document !== 'undefined') {
      document.body.classList.remove('onboarding-hijack-active');
      const mainContent = document.getElementById('main-content');
      if (mainContent) {
        mainContent.removeAttribute('inert');
        mainContent.style.pointerEvents = '';
        mainContent.style.filter = '';
      }
    }
    return;
  }
  
  // Force onboarding if explicitly marked new, or user record exists and onboarding is not complete
  const needsOnboarding = isNewUser || (state.userData && state.userData.hasCompletedOnboarding !== true);
  
  if (needsOnboarding) {
    state.onboardingActive = true;
    notify('onboarding');
    
    if (typeof document !== 'undefined') {
      document.body.classList.add('onboarding-hijack-active');
      const mainContent = document.getElementById('main-content');
      if (mainContent) {
        mainContent.setAttribute('inert', 'true');
        mainContent.style.pointerEvents = 'none';
        mainContent.style.filter = 'blur(12px)';
        mainContent.style.transition = 'filter 0.3s ease';
      }
      
      let onboarding = document.querySelector('app-onboarding');
      if (!onboarding) {
        onboarding = document.createElement('app-onboarding');
        document.body.appendChild(onboarding);
      }
      onboarding.removeAttribute('hidden');
      onboarding.style.display = 'block';
      if (typeof onboarding._paint === 'function') {
        onboarding._paint();
      }
    }
  } else {
    state.onboardingActive = false;
    notify('onboarding');
    if (typeof document !== 'undefined') {
      document.body.classList.remove('onboarding-hijack-active');
      const mainContent = document.getElementById('main-content');
      if (mainContent) {
        mainContent.removeAttribute('inert');
        mainContent.style.pointerEvents = '';
        mainContent.style.filter = '';
      }
    }
  }
}

export function setOnboardingActive(active, step = 0) {
  state.onboardingActive = active;
  state.onboardingStep = step;
  notify('onboarding');
  if (!active && typeof document !== 'undefined') {
    document.body.classList.remove('onboarding-hijack-active');
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.removeAttribute('inert');
      mainContent.style.pointerEvents = '';
      mainContent.style.filter = '';
    }
    const onboarding = document.querySelector('app-onboarding');
    if (onboarding) {
      onboarding.style.display = 'none';
      onboarding.setAttribute('hidden', '');
    }
  }
}

export function setShowWelcomeGold(show) {
  state.showWelcomeGold = show;
  notify('onboarding');
}

export function setLanguage(lang, persist = true) {
  let normalizedLang = lang;
  if (normalizedLang === 'us' || normalizedLang === 'en-US') {
    normalizedLang = 'en';
  }
  state.language = normalizedLang;
  state.currentLang = normalizedLang;
  if (persist) localStorage.setItem('harbor_language', normalizedLang);
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
  notify('language');
  notify('*');
  window.dispatchEvent(new CustomEvent('harbor:language', { detail: { language: lang } }));
}

export function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem('harbor_theme', theme);
  document.documentElement.classList.remove('dark-theme', 'deep-sea-theme', 'green-theme', 'black-theme');
  document.documentElement.removeAttribute('data-theme');
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark-theme');
  } else if (theme === 'deep-sea') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('deep-sea-theme');
  } else if (theme === 'green-theme') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('green-theme');
  } else if (theme === 'black') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('black-theme');
  }
  notify('theme');
}

export function toggleTheme() {
  const order = ['dark', 'deep-sea', 'green-theme', 'black', 'light'];
  const idx = order.indexOf(state.theme);
  setTheme(order[(idx + 1) % order.length]);
}

export function t(key, fallback) {
  const en = locales.en;
  const englishFallback = fallback ?? (en?.[key] !== undefined && en?.[key] !== null && String(en[key]).trim() !== '' ? en[key] : key);
  const loc = locales[state.language];
  const val = loc?.[key];
  if (val !== undefined && val !== null && String(val).trim() !== '') return val;
  const enVal = en?.[key];
  if (enVal !== undefined && enVal !== null && String(enVal).trim() !== '') return enVal;
  return englishFallback;
}

export function setCurrentScreen(screen) {
  state.currentScreen = screen;
  notify('currentScreen');
}

export function setSoundEnabled(enabled) {
  state.soundEnabled = enabled;
  localStorage.setItem('harbor_sound', enabled ? 'true' : 'false');
  notify('soundEnabled');
}

export function toggleSound() {
  setSoundEnabled(!state.soundEnabled);
}

export function navigateTo(page, params = {}) {
  if (window.__harborRouter?.navigate) {
    window.__harborRouter.navigate(page, params);
    return;
  }
  import('./router.js').then(({ softNavigate }) => softNavigate(page, params)).catch(() => {
    showToast(`Navigation to "${page}" failed. Please try again.`, 'error');
  });
}

export function showToast(message, type = 'success') {
  const existing = state.toasts.find(t => t.message === message);
  if (existing) {
    existing.shake = true;
    notify('toasts');
    setTimeout(() => {
      existing.shake = false;
      notify('toasts');
    }, 400);
    return;
  }

  if (state.toasts.length >= 3) {
    const oldest = state.toasts[0];
    if (oldest) {
      removeToast(oldest.id);
    }
  }

  const id = Date.now().toString() + Math.random().toString(36).slice(2);
  state.toasts = [...state.toasts, { id, message, type, shake: false }];
  notify('toasts');
  setTimeout(() => removeToast(id), 4000);
}

export function removeToast(id) {
  state.toasts = state.toasts.filter((t) => t.id !== id);
  notify('toasts');
}

// 🔥 Updated showConfirm with custom button labels
export function showConfirm(title, message, requireInput, callback, successMessage, confirmText = 'Yes', cancelText = 'Cancel') {
  state.confirmModal = {
    isOpen: true,
    title,
    message,
    requireInput,
    callback,
    successMessage: successMessage || '',
    confirmText,
    cancelText,
  };
  notify('confirmModal');
}

export function closeConfirm() {
  state.confirmModal = { ...state.confirmModal, isOpen: false };
  notify('confirmModal');
}

export function getQueryParam(name) {
  const hash = window.location.hash || '';
  const questionIdx = hash.indexOf('?');
  if (questionIdx !== -1) {
    let queryStr = hash.slice(questionIdx + 1);
    const hashIdx = queryStr.indexOf('#');
    if (hashIdx !== -1) {
      queryStr = queryStr.slice(0, hashIdx);
    }
    const val = new URLSearchParams(queryStr).get(name);
    if (val !== null) return val;
  }
  return new URLSearchParams(window.location.search).get(name);
}

export function setSidebarOpen(open) {
  state.sidebarOpen = open;
  if (open && state.menuOpen) { state.menuOpen = false; notify('menuOpen'); }
  notify('sidebarOpen');
}

export function setMenuOpen(open) {
  state.menuOpen = open;
  if (open && state.sidebarOpen) { state.sidebarOpen = false; notify('sidebarOpen'); }
  notify('menuOpen');
}

export function openSidebar() { setSidebarOpen(true); }
export function closeSidebar() { setSidebarOpen(false); }
export function toggleSidebar() { setSidebarOpen(!state.sidebarOpen); }
export function openMobileMenu() { setMenuOpen(true); }
export function closeMobileMenu() { setMenuOpen(false); }

export function setFeedScroll(y) {
  state.feedScrollY = y;
  sessionStorage.setItem('feed_scroll_y', String(y));
  sessionStorage.setItem('feedScrollPosition', String(y));
  notify('feedScroll');
}

export function getFeedScroll() {
  const stored = sessionStorage.getItem('feedScrollPosition') || sessionStorage.getItem('feed_scroll_y');
  return stored ? parseInt(stored, 10) : state.feedScrollY;
}

export function clearFeedScroll() {
  state.feedScrollY = 0;
  sessionStorage.removeItem('feed_scroll_y');
  sessionStorage.removeItem('feedScrollPosition');
  notify('feedScroll');
}

export function captureFeedState(scrollY, category) {
  setFeedScroll(scrollY);
  setFeedCategory(category);
  sessionStorage.setItem('feed_restore_pending', 'true');
}

export function shouldRestoreFeed() {
  return sessionStorage.getItem('feed_restore_pending') === 'true';
}

export function markFeedRestored() {
  sessionStorage.removeItem('feed_restore_pending');
}

export function navigateToProfile(uid) {
  if (!uid) return;
  navigateTo('profile', { uid });
}

export function setFeedCategory(cat) {
  state.feedActiveCategory = cat;
  sessionStorage.setItem('feed_active_category', cat);
  notify('feedCategory');
}

export function getFeedCategory() {
  return sessionStorage.getItem('feed_active_category') || state.feedActiveCategory || 'all';
}

export function requireAuth() {
  return new Promise((resolve) => {
    if (!state.authLoading && !state.user) {
      navigateTo('welcome');
      return;
    }
    const unsub = subscribe('authLoading', () => {
      if (!state.authLoading) {
        unsub();
        if (!state.user) {
          navigateTo('welcome');
        } else if (!state.user.emailVerified) {
          navigateTo('welcome');
          showToast('📧 Please verify your email first.', 'warning');
        } else {
          resolve(state.user);
        }
      }
    });
    if (!state.authLoading && state.user) {
      if (!state.user.emailVerified) {
        navigateTo('welcome');
        showToast('📧 Please verify your email first.', 'warning');
      } else {
        resolve(state.user);
      }
    }
  });
}

setTheme(state.theme);
setLanguage(state.language, false);