/**
 * Firebase initialization via CDN ES modules (zero build step).
 */
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import { 
  getAuth, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup,
  deleteUser // 🔥 NEW: Import deleteUser
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  arrayUnion,
  arrayRemove,
  collection,
  runTransaction,
  increment,
  deleteDoc,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: (import.meta.env && import.meta.env.VITE_FIREBASE_API_KEY) || 'AIzaSyBoYWOijOWqjd3d3_NAiSsiGmQ0HokaRGs',
  authDomain: (import.meta.env && import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) || 'the-harbor-community.firebaseapp.com',
  projectId: (import.meta.env && import.meta.env.VITE_FIREBASE_PROJECT_ID) || 'the-harbor-community',
  storageBucket: (import.meta.env && import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) || 'the-harbor-community.firebasestorage.app',
  messagingSenderId: (import.meta.env && import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) || '634248505303',
  appId: (import.meta.env && import.meta.env.VITE_FIREBASE_APP_ID) || '1:634248505303:web:4eb16e6a9f97903420cd92',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  cache: persistentLocalCache()
});

export { 
  onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup, 
  doc, onSnapshot, updateDoc, setDoc, arrayUnion, arrayRemove, 
  collection, runTransaction, increment, deleteUser, deleteDoc 
};

/** Resolve canonical story/comment author key (authorId preferred, userId legacy fallback). */
export function resolveAuthorId(data) {
  if (!data) return '';
  return data.authorId || data.userId || '';
}

/** Attach both authorId and userId for schema parity on writes. */
export function withAuthorFields(payload, uid) {
  return { ...payload, authorId: uid, userId: uid };
}

/** Register compliant user document on signup */
export function createCompliantRegisterPayload({ uid, name, email, gender, country, favorites, emergencyNumber, language, birthday, status }) {
  return {
    id: uid,
    uid,
    authorId: uid,
    userId: uid,
    name,
    email,
    gender: gender || '🙅 Prefer not to say',
    favorites: favorites || '',
    country: country || '',
    emergencyNumber: emergencyNumber || '',
    emailVerified: false,
    isAdmin: false,
    isPublic: true,
    goldBalance: 100,
    goldReceived: 0,
    goldGiven: 0,
    followers: [],
    following: [],
    storyCount: 0,
    commentCount: 0,
    likesReceived: 0,
    language: language || 'en',
    avatar: '👤',
    border: 'default',
    birthday: birthday || '',
    status: status || '',
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
  };
}

// 🔥 NEW: Auto-cleanup unverified accounts older than 10 minutes
export async function cleanupUnverifiedAccount(user) {
  if (!user) return false;
  if (user.emailVerified) return false;

  const creationTime = user.metadata?.creationTime;
  if (!creationTime) return false;

  const created = new Date(creationTime).getTime();
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000;

  if (now - created > tenMinutes) {
    try {
      await deleteUser(user);
      await signOut(auth);
      return true;
    } catch (err) {
      console.warn('Cleanup unverified account failed:', err);
      return false;
    }
  }
  return false;
}

// 🔥 NEW: Record and increment story views with 30-minute deduplication
export async function recordStoryView(storyId, currentUid) {
  if (!storyId) return false;
  const userId = currentUid || 'anon';
  const storageKey = `harbor_view_${storyId}_${userId}`;
  const lastViewed = localStorage.getItem(storageKey);
  const now = Date.now();
  
  if (lastViewed) {
    const elapsed = now - parseInt(lastViewed, 10);
    if (elapsed < 30 * 60 * 1000) {
      return false; // Less than 30 minutes, skip
    }
  }
  
  localStorage.setItem(storageKey, String(now));
  
  try {
    const storyRef = doc(db, 'stories', storyId);
    await updateDoc(storyRef, {
      views: increment(1)
    });
    return true;
  } catch (err) {
    console.warn('Failed to increment view count:', err);
    return false;
  }
}

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
