/**
 * App Shell — initializes auth, registers components, shared page setup.
 */
import {
  setUser, setUserData, setAuthLoading, setShellReady, subscribe, getState,
  showToast, navigateTo, t, openSidebar, closeSidebar,
  setCurrentScreen, setOnboardingActive, checkAndForceOnboarding, setBookmarks,
} from './store.js';
import { auth, db, onAuthStateChanged, doc, onSnapshot, cleanupUnverifiedAccount, collection, handleFirestoreError, OperationType } from './firebase.js';
import { initRouter, interceptNavigationClick } from './router.js';
import { playToneForEvent } from './audio.js';
import { initPWA } from './pwa.js';

// 🔥 FIXED: Import directly from CDN (not from firebase.js)
import {
  deleteUser,
  reauthenticateWithPopup,
  GoogleAuthProvider,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

import './components/app-navigation.js';
import './components/app-footer.js';
import './components/app-sidebar.js';
import './components/app-hamburger.js';
import './components/app-auth-modal.js';
import './components/app-confirm-modal.js';
import './components/app-gold-modal.js';
import './components/app-edit-story-modal.js';
import './components/app-toast-host.js';
import './components/app-floating-emojis.js';
import './components/app-onboarding.js';
import './components/app-story-card.js';
import './components/app-skeleton-stories.js';
import './components/app-achievements.js';
import './components/app-loading-screen.js';

export { followUser, logoutUser, changeLanguage } from './actions.js';

// 🔥 Router initialised as early as possible
initRouter();
initPWA();

subscribe('shellReady', () => {
  const { shellReady } = getState();
  if (shellReady) {
    document.body.classList.add('shell-ready');
  } else {
    document.body.classList.remove('shell-ready');
  }
});

let profileUnsub = null;
let bookmarksUnsub = null;
let activeProfileUid = null;
let shellBootstrapped = false;

window.__harborAuthUid = () => getState().user?.uid || '';

function _runAuthPipeline(firebaseUser, userDataExists) {
  if (!firebaseUser) {
    setCurrentScreen(null);
    setOnboardingActive(false);
    return;
  }

  // 🔥 CRITICAL: Block unverified users
  if (!firebaseUser.emailVerified) {
    setCurrentScreen('verify-email');
    setOnboardingActive(false);
    setUserData(null);
    navigateTo('welcome');
    showToast('📧 Please verify your email before accessing The Harbor.', 'warning');
    return;
  }

  // ✅ Only proceed if verified
  setCurrentScreen('app');
  sessionStorage.setItem('harbor_was_logged_in', 'true');
  
  // Synchronously evaluate onboarding
  checkAndForceOnboarding();
}

onAuthStateChanged(auth, async (firebaseUser) => {
  setUser(firebaseUser);

  // AUTO-CLEANUP: Delete unverified accounts older than 10 minutes
  if (firebaseUser && !firebaseUser.emailVerified) {
    const wasDeleted = await cleanupUnverifiedAccount(firebaseUser);
    if (wasDeleted) {
      showToast('⏰ Your unverified account was automatically deleted after 10 minutes. Please sign up again.', 'info');
      setUser(null);
      setUserData(null);
      setAuthLoading(false);
      hideLoadingScreen();
      navigateTo('welcome');
      return;
    }
  }

  if (firebaseUser) {
    if (activeProfileUid === firebaseUser.uid && profileUnsub) {
      // Already listening to this user, do not recreate/duplicate listener
      return;
    }
    if (profileUnsub) {
      profileUnsub();
      profileUnsub = null;
    }
    if (bookmarksUnsub) {
      bookmarksUnsub();
      bookmarksUnsub = null;
    }
    activeProfileUid = firebaseUser.uid;

    // Block unverified users from accessing Firestore
    if (!firebaseUser.emailVerified) {
      setAuthLoading(false);
      setUserData(null);
      setBookmarks([]);
      hideLoadingScreen();
      _runAuthPipeline(firebaseUser, false);
      return;
    }

    // Only listen to Firestore if verified
    sessionStorage.setItem('harbor_was_logged_in', 'true');
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    profileUnsub = onSnapshot(userDocRef, (docSnap) => {
      const exists = docSnap.exists();
      if (exists) setUserData(docSnap.data());
      setAuthLoading(false);
      hideLoadingScreen();
      _runAuthPipeline(firebaseUser, exists);
    }, () => {
      setAuthLoading(false);
      hideLoadingScreen();
      _runAuthPipeline(firebaseUser, false);
    });

    const bookmarksColRef = collection(db, 'users', firebaseUser.uid, 'bookmarks');
    bookmarksUnsub = onSnapshot(bookmarksColRef, (snap) => {
      const bList = [];
      snap.forEach(d => {
        bList.push(d.id);
      });
      setBookmarks(bList);
    }, (err) => {
      console.warn('Bookmarks listener failed:', err);
      if (err.code === 'permission-denied') {
        const errInfo = {
          error: err.message,
          authInfo: {
            userId: auth.currentUser?.uid,
            email: auth.currentUser?.email,
            emailVerified: auth.currentUser?.emailVerified,
            isAnonymous: auth.currentUser?.isAnonymous,
            tenantId: auth.currentUser?.tenantId,
            providerInfo: auth.currentUser?.providerData?.map(p => ({
              providerId: p.providerId,
              email: p.email,
            })) || []
          },
          operationType: OperationType.LIST,
          path: `users/${firebaseUser.uid}/bookmarks`
        };
        console.error('Firestore Error: ', JSON.stringify(errInfo));
        showToast('⚠️ Unable to load bookmarks. Please verify your email or ensure rules are deployed.', 'warning');
      }
    });
  } else {
    if (profileUnsub) {
      profileUnsub();
      profileUnsub = null;
    }
    if (bookmarksUnsub) {
      bookmarksUnsub();
      bookmarksUnsub = null;
    }
    activeProfileUid = null;
    setUserData(null);
    setBookmarks([]);
    setAuthLoading(false);
    hideLoadingScreen();
    _runAuthPipeline(null, false);
  }
});

setTimeout(() => {
  if (getState().authLoading) {
    setAuthLoading(false);
    hideLoadingScreen();
  }
}, 4000);

function hideLoadingScreen() {
  const screen = document.querySelector('app-loading-screen');
  if (screen) {
    screen.hide();
    window.dispatchEvent(new CustomEvent('harbor:loading-hidden'));
  }
  if (!getState().authLoading) setShellReady(true);
  _guardEmailVerification();
}

// Centralized cleanup registry for Firestore listeners & general page cleanups
export const cleanupRegistry = [];
window.cleanupRegistry = cleanupRegistry;

export function clearView() {
  const main = document.getElementById('main-content');
  if (main) {
    main.innerHTML = '';
  }
  while (cleanupRegistry.length > 0) {
    const unsub = cleanupRegistry.pop();
    if (unsub && typeof unsub === 'function') {
      try {
        unsub();
      } catch (err) {
        console.warn('Error executing cleanup/unsubscription:', err);
      }
    }
  }
}
window.clearView = clearView;

function _bindGlobalClickIntercept() {
  document.addEventListener('click', (event) => {
    if (interceptNavigationClick(event)) return;
    const path = event.composedPath?.() || [];
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      if (node.closest('app-auth-modal')) return;
      if (node.type === 'file') return;
      if (node.closest('button[type="submit"], input[type="submit"]')) return;
      if (node.tagName === 'BUTTON' || node.tagName === 'A' || node.getAttribute?.('role') === 'tab'
        || node.classList?.contains('feed-tab') || node.classList?.contains('category-tab')
        || node.classList?.contains('react-btn') || node.classList?.contains('comment-react')
        || node.classList?.contains('story-reaction') || node.classList?.contains('donate-btn')) {
        playToneForEvent(node);
        break;
      }
    }
  }, true);
}

function bootstrapShell() {
  if (shellBootstrapped) return;
  shellBootstrapped = true;
  // Router already initialised at the top

  _bindGlobalClickIntercept();

  document.addEventListener('story-bookmark-toggle', async (e) => {
    const { id, isBookmarked } = e.detail;
    const { user } = getState();
    if (!user) {
      showToast('🔒 ' + t('bookmark_auth_required', 'Please log in or verify your account to bookmark stories.'), 'warning');
      window.openAuthModal?.('login');
      return;
    }

    try {
      const { setDoc, deleteDoc, doc, db } = await import('./firebase.js');
      const bookmarkRef = doc(db, 'users', user.uid, 'bookmarks', id);
      if (isBookmarked) {
        try {
          await setDoc(bookmarkRef, { storyId: id, timestamp: new Date().toISOString() });
          showToast('🔖 ' + t('story_bookmarked', 'Story saved to bookmarks.'), 'success');
        } catch (setErr) {
          handleFirestoreError(setErr, OperationType.CREATE, `users/${user.uid}/bookmarks/${id}`);
        }
      } else {
        try {
          await deleteDoc(bookmarkRef);
          showToast('🔖 ' + t('story_unbookmarked', 'Story removed from bookmarks.'), 'info');
        } catch (delErr) {
          handleFirestoreError(delErr, OperationType.DELETE, `users/${user.uid}/bookmarks/${id}`);
        }
      }
    } catch (err) {
      console.error('Failed to toggle bookmark:', err);
      showToast('❌ ' + t('bookmark_error', 'Failed to update bookmark.'), 'error');
    }
  });

  const fab = document.getElementById('settings-fab');
  if (fab) {
    const paintFab = () => { fab.hidden = !getState().user; };
    paintFab();
    fab.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openSidebar(); });
    subscribe('user', paintFab);
  }

  subscribe('user', () => {
    if (!getState().authLoading) setShellReady(true);
    _guardEmailVerification();
  });
}

function _guardEmailVerification() {
  const { authLoading, user, currentScreen } = getState();
  if (authLoading || !user || user.emailVerified) return;
  if (currentScreen !== 'verify-email') setCurrentScreen('verify-email');
  setOnboardingActive(false);
  navigateTo('welcome');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapShell);
} else {
  bootstrapShell();
}

window.openAuthModal = (mode = 'login') => document.querySelector('app-auth-modal')?.open(mode);
window.openGoldModal = (storyId, isComment = false) => document.querySelector('app-gold-modal')?.open(storyId, isComment);
window.openEditStoryModal = (storyId) => document.querySelector('app-edit-story-modal')?.open(storyId);
window.openBugReport = () => {
  closeSidebar();
  const modal = document.getElementById('bug-report-modal');
  if (modal) modal.hidden = false;
};

// ================================================================
// 🔥 Account deletion function (for verified users)
// ================================================================
async function deleteAccount() {
  const { user } = getState();
  if (!user) {
    showToast('❌ No user signed in.', 'error');
    return;
  }

  const provider = new GoogleAuthProvider();

  try {
    // 1. Force re‑authentication (required by Firebase for security)
    await reauthenticateWithPopup(auth, provider);
    // 2. Delete the account
    await deleteUser(user);
    // 3. Sign out (logoutUser is imported from actions.js)
    await logoutUser();
    showToast('✅ Account deleted successfully.', 'success');
    navigateTo('welcome');
  } catch (error) {
    console.error('Deletion error:', error.code, error.message);
    if (error.code === 'auth/requires-recent-login') {
      showToast('⏳ Please re‑authenticate and try again.', 'warning');
    } else if (error.code === 'auth/popup-closed-by-user') {
      showToast('Popup closed – please try again.', 'info');
    } else if (error.code === 'auth/too-many-requests') {
      showToast('Too many attempts. Wait a moment and try again.', 'error');
    } else {
      showToast('❌ Failed to delete account: ' + error.message, 'error');
    }
  }
}

// Expose function globally so it can be called from HTML buttons
window.deleteAccount = deleteAccount;

export { getState, subscribe, showToast, navigateTo, t };
