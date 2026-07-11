/**
 * Shared user actions (avoids circular imports between shell and components)
 */
import { getState, showToast, navigateTo, t, setLanguage, setUser, setUserData } from './store.js';
import {
  auth, db, signOut, doc, updateDoc, arrayUnion, arrayRemove, collection, runTransaction,
} from './firebase.js';

export async function followUser(targetUid) {
  const { user, userData } = getState();
  if (!user) { showToast(t('login_required', 'Please log in to follow users.'), 'warning'); return; }
  if (user.uid === targetUid) { showToast('You cannot follow yourself.', 'warning'); return; }
  try {
    const userRef = doc(db, 'users', user.uid);
    const targetRef = doc(db, 'users', targetUid);
    await runTransaction(db, async (transaction) => {
      const userDoc = await transaction.get(userRef);
      const targetDoc = await transaction.get(targetRef);
      if (!userDoc.exists() || !targetDoc.exists()) throw new Error('User data not found');
      const following = userDoc.data().following || [];
      if (following.includes(targetUid)) {
        transaction.update(userRef, { following: arrayRemove(targetUid) });
        transaction.update(targetRef, { followers: arrayRemove(user.uid) });
      } else {
        transaction.update(userRef, { following: arrayUnion(targetUid) });
        transaction.update(targetRef, { followers: arrayUnion(user.uid) });
        transaction.set(doc(collection(db, 'notifications')), {
          toUid: targetUid, fromUid: user.uid, fromName: userData?.name || 'Someone',
          type: 'follow', data: {}, read: false, createdAt: new Date().toISOString(),
        });
      }
    });
    showToast(userData?.following?.includes(targetUid) ? '✅ Unfollowed' : '✅ Followed!', 'success');
  } catch (err) {
    showToast(`❌ Follow failed: ${err.message}`, 'error');
  }
}

export async function logoutUser() {
  try {
    await signOut(auth);
    sessionStorage.removeItem('harbor_was_logged_in');
    sessionStorage.removeItem('harbor_onboarded');
    sessionStorage.removeItem('harbor_new_signup');
    localStorage.removeItem('harbor_onboarded_complete');
    setUserData(null);
    setUser(null);
    showToast('✅ Logged out successfully!', 'success');
    navigateTo('welcome');
  } catch (err) {
    showToast(`❌ Logout failed: ${err.message}`, 'error');
  }
}

export async function changeLanguage(lang) {
  const { user } = getState();
  setLanguage(lang);
  if (user) {
    try { await updateDoc(doc(db, 'users', user.uid), { language: lang }); }
    catch (err) { console.warn('Failed to update language:', err); }
  }
}
