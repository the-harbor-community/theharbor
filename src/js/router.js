import { navigateTo, showToast, getState, subscribe } from './store.js';
import { playTone } from './audio.js';
import { translatePage } from './utils/i18n.js';

const FILE_TO_KEY = {
  'index.html': 'feed',
  'welcome.html': 'welcome',
  'story.html': 'story',
  'profile.html': 'profile',
  'admin.html': 'admin',
  'admin-bugs.html': 'admin-bugs',
  'activity.html': 'activity',
  'daily-rewards.html': 'daily-rewards',
  'leaderboard.html': 'leaderboard',
  'notifications.html': 'notifications',
  'submit.html': 'submit',
  'suggest.html': 'suggest',
  'delete-account.html': 'delete-account',
  'transactions.html': 'transactions',
  'about.html': 'about',
  'philosophy.html': 'philosophy',
  'terms.html': 'terms',
  'privacy.html': 'privacy',
  'emergency.html': 'emergency',
  'donate.html': 'donate',
  'bookmarks.html': 'bookmarks',
};

const KEY_TO_FILE = Object.fromEntries(Object.entries(FILE_TO_KEY).map(([f, k]) => [k, f]));

// 🔥 AUTO-DETECT: Works on ANY repo - root or subdirectory
const getBasePath = () => {
  const pathname = window.location.pathname;
  if (pathname === '/' || pathname === '') return '';
  const parts = pathname.split('/').filter(p => p);
  if (parts.length === 0) return '';
  let pageIdx = parts.findIndex(p => {
    const clean = p.split('?')[0].split('#')[0];
    return clean.endsWith('.html') || FILE_TO_KEY[clean] != null || FILE_TO_KEY[clean + '.html'] != null;
  });
  if (pageIdx !== -1) {
    const baseParts = parts.slice(0, pageIdx);
    return baseParts.length > 0 ? '/' + baseParts.join('/') : '';
  }
  const last = parts[parts.length - 1];
  if (last.includes('.')) {
    const baseParts = parts.slice(0, -1);
    return baseParts.length > 0 ? '/' + baseParts.join('/') : '';
  }
  return '/' + parts.join('/');
};

const BASE_PATH = getBasePath();

const MODULE_LOADERS = {
  feed: () => import('./pages/feed.js'),
  welcome: () => import('./pages/welcome.js'),
  story: () => import('./pages/story.js'),
  profile: () => import('./pages/profile.js'),
  admin: () => import('./pages/admin.js'),
  'admin-bugs': () => import('./pages/admin-bugs.js'),
  activity: () => import('./pages/activity.js'),
  'daily-rewards': () => import('./pages/daily-rewards.js'),
  leaderboard: () => import('./pages/leaderboard.js'),
  notifications: () => import('./pages/notifications.js'),
  submit: () => import('./pages/submit.js'),
  suggest: () => import('./pages/suggest.js'),
  'delete-account': () => import('./pages/delete-account.js'),
  transactions: () => import('./pages/transactions.js'),
  about: () => import('./pages/static.js'),
  philosophy: () => import('./pages/static.js'),
  terms: () => import('./pages/static.js'),
  privacy: () => import('./pages/static.js'),
  emergency: () => import('./pages/static.js'),
  donate: () => import('./pages/donate.js'),
  bookmarks: () => import('./pages/bookmarks.js'),
};

const pageHandlers = new Map();
let navigating = false;
let routerReady = false;

const pageSubscriptions = [];
const pageCleanups = [];

export function registerPageSubscription(unsub) {
  if (typeof unsub === 'function') {
    pageSubscriptions.push(unsub);
    const registry = window.cleanupRegistry || [];
    if (!registry.includes(unsub)) {
      registry.push(unsub);
    }
  }
}

export function clearPageSubscriptions() {
  while (pageSubscriptions.length > 0) {
    const unsub = pageSubscriptions.pop();
    try {
      if (unsub && typeof unsub === 'function') {
        unsub();
      }
    } catch (e) {
      console.warn('Error during page subscription cleanup:', e);
    }
  }
}

export function registerPageCleanup(fn) {
  if (typeof fn === 'function') {
    pageCleanups.push(fn);
    const registry = window.cleanupRegistry || [];
    if (!registry.includes(fn)) {
      registry.push(fn);
    }
  }
}

export function clearPageCleanups() {
  while (pageCleanups.length > 0) {
    const fn = pageCleanups.pop();
    try {
      if (fn && typeof fn === 'function') {
        fn();
      }
    } catch (e) {
      console.warn('Error during page cleanup execution:', e);
    }
  }
}

export function parseHash() {
  const hash = window.location.hash || '';
  const cleanHash = hash.replace(/^#\/?/, '');
  
  // 🔥 FIX: Default to welcome if no hash - Works on ANY repo
  if (!cleanHash) {
    return { pageKey: 'welcome', params: {} };
  }
  
  const hashParts = cleanHash.split('#');
  const mainPart = hashParts[0];
  const fragmentPart = hashParts[1];

  const [pagePart, queryPart] = mainPart.split('?');
  const pageKey = FILE_TO_KEY[pagePart] || pagePart || 'welcome';
  const params = {};
  if (queryPart) {
    const sp = new URLSearchParams(queryPart);
    for (const [k, v] of sp.entries()) {
      params[k] = v;
    }
  }
  if (fragmentPart) {
    params.hash = fragmentPart;
  }
  return { pageKey, params };
}

export function detectCurrentPageKey() {
  const { pageKey } = parseHash();
  return pageKey;
}

export function buildPageUrl(pageKey, params = {}) {
  let url = `#${pageKey}`;
  const searchParams = new URLSearchParams();
  if (pageKey === 'story' && params.id != null) searchParams.set('id', params.id);
  if (pageKey === 'profile' && params.uid != null) searchParams.set('uid', params.uid);
  const searchStr = searchParams.toString();
  if (searchStr) url += `?${searchStr}`;
  if (params.hash) {
    url += `#${params.hash}`;
  }
  return url;
}

export function parseInternalHref(href) {
  if (!href || typeof href !== 'string') return null;
  try {
    const normalized = href.replace(/^\.\//, '');
    const url = new URL(normalized, window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.origin !== window.location.origin) return null;
    
    if (url.hash) {
      const cleanHash = url.hash.replace(/^#\/?/, '');
      const [pagePart, queryPart] = cleanHash.split('?');
      const pageKey = FILE_TO_KEY[pagePart] || pagePart || 'feed';
      if (FILE_TO_KEY[pagePart] || KEY_TO_FILE[pagePart] || pagePart === 'feed') {
        const params = {};
        if (queryPart) {
          const sp = new URLSearchParams(queryPart);
          for (const [k, v] of sp.entries()) {
            params[k] = v;
          }
        }
        return { pageKey, params, targetUrl: url.hash };
      }
    }
    
    const file = url.pathname.split('/').pop() || 'index.html';
    const pageKey = FILE_TO_KEY[file];
    if (!pageKey) return null;
    const params = {};
    if (pageKey === 'story') params.id = url.searchParams.get('id') || '';
    if (pageKey === 'profile') params.uid = url.searchParams.get('uid') || '';
    let targetHash = url.hash ? url.hash.slice(1) : '';
    if (targetHash) params.hash = targetHash;
    return { pageKey, params, targetUrl: buildPageUrl(pageKey, params) };
  } catch {
    return null;
  }
}

export function onPageEnter(pageKey, fn) {
  pageHandlers.set(pageKey, fn);
}

async function syncPageCss(doc) {
  const promises = [];
  const oldLinks = Array.from(document.querySelectorAll('link[data-harbor-page]'));
  
  doc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || !href.includes('pages/')) return;
    
    const fullHref = BASE_PATH ? `${BASE_PATH}/${href.replace(/^\//, '')}` : href;
    const exists = oldLinks.some(el => el.getAttribute('href') === fullHref);
    if (exists) return;
    
    const el = document.createElement('link');
    el.rel = 'stylesheet';
    el.href = fullHref;
    el.setAttribute('data-harbor-page', '');
    
    const loadPromise = new Promise((resolve) => {
      el.onload = () => resolve();
      el.onerror = () => resolve();
    });
    promises.push(loadPromise);
    
    document.head.appendChild(el);
  });
  
  await Promise.all(promises);
  
  oldLinks.forEach((el) => {
    const isNeeded = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).some(link => {
      const href = link.getAttribute('href');
      if (!href || !href.includes('pages/')) return false;
      const fullHref = BASE_PATH ? `${BASE_PATH}/${href.replace(/^\//, '')}` : href;
      return el.getAttribute('href') === fullHref;
    });
    if (!isNeeded) {
      el.remove();
    }
  });
}

function syncBodyClass(doc) {
  const baseClass = doc.body?.className || 'app-shell';
  document.body.className = baseClass;
  const { shellReady } = getState();
  if (shellReady) {
    document.body.classList.add('shell-ready');
  } else {
    document.body.classList.remove('shell-ready');
  }
}

async function ensureModule(pageKey) {
  const loader = MODULE_LOADERS[pageKey];
  if (loader) await loader();
}

function invokePageHandler(pageKey) {
  const fn = pageHandlers.get(pageKey);
  if (fn) {
    const unsub = fn();
    if (unsub && typeof unsub === 'function') {
      registerPageSubscription(unsub);
    }
  }
  window.dispatchEvent(new CustomEvent('harbor:route', { detail: { page: pageKey } }));
}

function swapMainContent(doc) {
  const newMain = doc.getElementById('main-content');
  const main = document.getElementById('main-content');
  if (!newMain || !main) return;
  main.className = newMain.className;
  const frag = document.createDocumentFragment();
  while (newMain.firstChild) frag.appendChild(newMain.firstChild);
  main.replaceChildren(frag);
}

const prefetchCache = new Map();

export async function prefetchPage(pageKey) {
  const file = KEY_TO_FILE[pageKey];
  if (!file) return;
  if (prefetchCache.has(pageKey)) return prefetchCache.get(pageKey);

  const fetchPromise = (async () => {
    try {
      const url = BASE_PATH ? `${BASE_PATH}/${file}` : file;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Fetch status: ${res.status}`);
      return await res.text();
    } catch (err) {
      prefetchCache.delete(pageKey);
      throw err;
    }
  })();

  prefetchCache.set(pageKey, fetchPromise);
  return fetchPromise;
}

export function disposeGlobalView() {
  if (typeof window.clearView === 'function') {
    window.clearView();
  }

  const main = document.getElementById('main-content');
  if (!main) return;

  const cleanMain = main.cloneNode(false);
  main.replaceWith(cleanMain);

  clearPageSubscriptions();
  clearPageCleanups();
}

async function performNavigation(pageKey, params, targetUrl, opts = {}) {
  if (navigating) return;
  navigating = true;

  try {
    const originalMain = document.getElementById('main-content');
    if (originalMain) {
      originalMain.style.pointerEvents = 'none';
      originalMain.style.opacity = '0';
      // Wait for smooth fade-out transition before clearing content
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    const { replace = false, skipPush = false } = opts;
    const file = KEY_TO_FILE[pageKey];
    if (!file) throw new Error(`Unknown page: ${pageKey}`);

    const isPrivatePage = !['welcome', 'about', 'philosophy', 'terms', 'privacy', 'emergency', 'donate'].includes(pageKey);
    if (isPrivatePage && getState().authLoading) {
      const loadingScreen = document.querySelector('app-loading-screen');
      if (loadingScreen) {
        if (typeof loadingScreen.show === 'function') {
          loadingScreen.show();
        } else {
          loadingScreen.removeAttribute('hidden');
          loadingScreen.style.display = 'block';
        }
      }
      await new Promise((resolve) => {
        const unsub = subscribe('authLoading', () => {
          if (!getState().authLoading) {
            unsub();
            resolve();
          }
        });
      });
    }

    if (isPrivatePage && (!getState().user || !getState().user.emailVerified)) {
      softNavigate('welcome', {}, { replace: true });
      return;
    }
    
    if (!window.parsedDocCache) {
      window.parsedDocCache = new Map();
    }
    
    let doc;
    if (window.parsedDocCache.has(pageKey)) {
      doc = window.parsedDocCache.get(pageKey).cloneNode(true);
    } else {
      let html;
      if (prefetchCache.has(pageKey)) {
        try {
          html = await prefetchCache.get(pageKey);
        } catch (err) {
          console.warn(`[Speculative Cache] Cache hit failed. Retrying network fetch.`, err);
        }
      }
      if (!html) {
        const url = BASE_PATH ? `${BASE_PATH}/${file}` : file;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to load ${file}`);
        html = await res.text();
      }
      const parsedDoc = new DOMParser().parseFromString(html, 'text/html');
      window.parsedDocCache.set(pageKey, parsedDoc);
      doc = parsedDoc.cloneNode(true);
    }

    if (doc.title) document.title = doc.title;
    syncBodyClass(doc);
    await syncPageCss(doc);
    await ensureModule(pageKey);

    // Dispose old view and clear event subscriptions ONLY when new page is fully ready
    disposeGlobalView();

    const main = document.getElementById('main-content');
    swapMainContent(doc);
    if (main) {
      translatePage(main);
      main.style.opacity = '0';
      main.style.pointerEvents = 'none';
      // Force a browser reflow to guarantee the opacity change is captured
      main.offsetHeight; 
    }

    invokePageHandler(pageKey);

    if (main) {
      main.offsetHeight; // Force another reflow before fading in
      main.style.opacity = '1';
      main.style.pointerEvents = '';
    }

    playTone('SECTION_TRANSITION');

    if (params.hash) {
      window.dispatchEvent(new CustomEvent('harbor:scroll-target', { detail: { hash: params.hash } }));
    }
  } catch (err) {
    console.error('Navigation error:', err);
    const main = document.getElementById('main-content');
    if (main) {
      main.style.opacity = '1';
      main.style.pointerEvents = '';
    }
  } finally {
    navigating = false;
  }
}

export async function softNavigate(pageKey, params = {}, opts = {}) {
  const state = getState();
  let activePageKey = (pageKey !== undefined && pageKey !== null) ? pageKey : 'welcome';  // 🔥 FIX: Default to welcome
  if (activePageKey === 'en' || activePageKey === 'us') {
    activePageKey = 'welcome';
  }

  if (state.onboardingActive) {
    console.warn('Navigation blocked: Onboarding is active and must be completed.');
    return;
  }
  const { replace = false } = opts;
  if (navigating) return;

  if (!activePageKey || !KEY_TO_FILE[activePageKey]) {
    showToast(`Unknown page: ${activePageKey}`, 'error');
    return;
  }

  const targetUrl = buildPageUrl(activePageKey, params);
  
  if (getState().menuOpen) {
    import('./store.js').then(m => m.closeMobileMenu());
  }
  if (getState().sidebarOpen) {
    import('./store.js').then(m => m.closeSidebar());
  }

  const currentHash = window.location.hash || '';
  if (currentHash === targetUrl) {
    // Already on the same page! Scroll to top smoothly instead of tearing down DOM and flashing
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Close any open search dropdowns
    document.querySelectorAll('.search-results-dropdown').forEach(d => {
      if (d instanceof HTMLElement) d.style.display = 'none';
    });
    return;
  } else {
    if (replace) {
      const url = new URL(window.location.href);
      url.hash = targetUrl;
      window.location.replace(url.href);
    } else {
      window.location.hash = targetUrl;
    }
  }
}

export function handleSPARouteChange(href) {
  const parsed = parseInternalHref(href);
  if (parsed) {
    return softNavigate(parsed.pageKey, parsed.params);
  }
  const clean = (href || '').replace(/^\.\//, '');
  const file = clean.split('?')[0].split('/').pop();
  const pageKey = FILE_TO_KEY[file];
  if (pageKey) {
    const url = new URL(clean, window.location.href);
    const params = {};
    if (pageKey === 'story') params.id = url.searchParams.get('id') || '';
    if (pageKey === 'profile') params.uid = url.searchParams.get('uid') || '';
    if (url.hash) params.hash = url.hash.slice(1);
    return softNavigate(pageKey, params);
  }
  return null;
}

export function refreshCurrentPage() {
  const { pageKey, params } = parseHash();
  return performNavigation(pageKey, params, window.location.hash, { skipPush: true });
}

function handlePopState(e) {
  // Let hashchange event handle hash-based routes
}

export function interceptAnchorClick(event) {
  if (event.__harborNavHandled) return true;
  const anchor = event.target.closest?.('a');
  if (!anchor) return false;
  const href = anchor.getAttribute('href');
  if (!href) return false;

  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return false;
  } catch (_) { return false; }

  if (href.startsWith('mailto:') || href.startsWith('tel:')) return false;
  if (anchor.target === '_blank' || anchor.hasAttribute('download')) return false;

  event.preventDefault();
  event.stopImmediatePropagation();
  event.__harborNavHandled = true;
  handleSPARouteChange(href);
  return true;
}

export function interceptNavigationClick(e) {
  if (e.__harborNavHandled) return true;
  if (interceptAnchorClick(e)) return true;

  const path = e.composedPath?.() || [];
  for (const node of path) {
    if (!(node instanceof Element)) continue;

    if (node.classList?.contains('feed-tab') || node.classList?.contains('category-tab') || node.getAttribute?.('role') === 'tab') {
      return false;
    }

    const page = node.dataset?.page;
    if (page) {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.__harborNavHandled = true;
      if (page === 'story') {
        const id = node.dataset.id || node.getAttribute('data-id') || '';
        if (id) {
          softNavigate('story', { id });
        }
      } else if (page === 'profile') {
        const uid = node.dataset.uid || window.__harborAuthUid?.() || '';
        if (uid) softNavigate('profile', { uid });
      } else {
        softNavigate(page);
      }
      return true;
    }

    if (node.dataset?.action === 'profile') {
      const uid = node.dataset.uid || node.getAttribute('data-uid') || '';
      if (uid) {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.__harborNavHandled = true;
        softNavigate('profile', { uid });
        return true;
      }
    }

    const inStoryCard = path.some((n) => n instanceof Element && n.tagName === 'APP-STORY-CARD');
    if (inStoryCard && (node.classList?.contains('react-btn') || node.dataset?.action === 'gold' || node.dataset?.action === 'read' || node.dataset?.action === 'comments')) {
      return false;
    }
  }
  return false;
}

export function initRouter() {
  if (routerReady) return;
  routerReady = true;

  // SPA Enforcer: Redirect pathname to hash routing
  const path = window.location.pathname;
  const file = path.split('/').pop() || 'index.html';
  if (file !== 'index.html' && file !== '' && FILE_TO_KEY[file]) {
    const pageKey = FILE_TO_KEY[file];
    const params = new URLSearchParams(window.location.search);
    let hashUrl = `#${pageKey}`;
    if (params.toString()) hashUrl += `?${params.toString()}`;
    if (window.location.hash) hashUrl += window.location.hash;
    window.location.replace('./index.html' + hashUrl);
    return;
  }

  // Register hashchange event listener
  window.addEventListener('hashchange', () => {
    const { pageKey, params } = parseHash();
    
    if (getState().menuOpen) {
      import('./store.js').then(m => m.closeMobileMenu());
    }
    if (getState().sidebarOpen) {
      import('./store.js').then(m => m.closeSidebar());
    }

    performNavigation(pageKey, params, window.location.hash, { skipPush: true });
  });

  // 🔥 FIX: Initial load - default to #welcome if no hash
  const { pageKey, params } = parseHash();
  
  // If no hash, redirect to #welcome
  if (!window.location.hash) {
    window.location.hash = '#welcome';
    return;
  }

  performNavigation(pageKey, params, window.location.hash, { skipPush: true });

  // Add global beforeunload protection
  window.addEventListener('beforeunload', (e) => {
    e.preventDefault();
    e.returnValue = '';
  });

  // Speculative Navigation Dwell Timer Vector tracking
  let hoverTimeout = null;
  document.addEventListener('mouseover', (e) => {
    const anchor = e.target.closest?.('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    const parsed = parseInternalHref(href);
    if (!parsed) return;

    if (hoverTimeout) clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      prefetchPage(parsed.pageKey).catch(() => {});
    }, 120);
  });

  document.addEventListener('mouseout', (e) => {
    const anchor = e.target.closest?.('a');
    if (anchor && hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
  });
}

window.__harborRouter = {
  navigate: softNavigate,
  refresh: refreshCurrentPage,
  intercept: interceptNavigationClick,
  handleSPARouteChange,
};
