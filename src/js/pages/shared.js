import { subscribe, getState, navigateTo, showToast } from '../store.js';
import { onPageEnter, detectCurrentPageKey, registerPageSubscription } from '../router.js';

/** Shared shell markup for authenticated pages */
export const AUTH_SHELL = `
  <app-footer></app-footer>
  <button id="settings-fab" class="settings-fab" hidden aria-label="Settings">⚙️</button>
  <app-sidebar></app-sidebar>
  <app-hamburger></app-hamburger>
  <app-auth-modal></app-auth-modal>
  <app-confirm-modal></app-confirm-modal>
  <app-gold-modal></app-gold-modal>
  <app-edit-story-modal></app-edit-story-modal>
  <app-toast-host></app-toast-host>
  <app-floating-emojis></app-floating-emojis>
  <app-onboarding></app-onboarding>`;

const pageUnsubs = new Map();

// 🔥 EXPORT guardAuth – used by all protected pages
export function guardAuth(callback, pageKey) {
  const runGuarded = () => {
    if (detectCurrentPageKey() !== pageKey) {
      const unsub = pageUnsubs.get(pageKey);
      if (unsub) {
        unsub();
        pageUnsubs.delete(pageKey);
      }
      return;
    }
    const { authLoading, user } = getState();
    if (authLoading) return;
    if (!user) {
      navigateTo('welcome');
      return;
    }
    // 🔥 Block unverified users
    if (!user.emailVerified) {
      navigateTo('welcome');
      showToast('📧 Please verify your email first.', 'warning');
      return;
    }
    callback();
  };

  onPageEnter(pageKey, () => {
    const oldUnsub = pageUnsubs.get(pageKey);
    if (oldUnsub) oldUnsub();
    
    const unsub = subscribe('authLoading', runGuarded);
    pageUnsubs.set(pageKey, unsub);
    registerPageSubscription(unsub);
    runGuarded();
  });
}
