/**
 * Profile page — view/edit, follow, privacy
 */
import { subscribe, getState, t, showToast, showConfirm, navigateTo, getQueryParam, patchUserData } from '../store.js';
import { db, doc, updateDoc, collection, auth, handleFirestoreError, OperationType } from '../firebase.js';
import { getDoc, getDocs, query, where, orderBy, addDoc } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import { validateUsername, getStatusForBirthday, checkVulgarWords, logFlaggedAttempt } from '../utils.js';
import { followUser, changeLanguage } from '../actions.js';
import { initBugReport } from '../page-common.js';
import { guardAuth } from './shared.js';
import { onPageEnter, detectCurrentPageKey, registerPageSubscription, registerPageCleanup } from '../router.js';
import { pageEl } from '../utils.js';

const AVATAR_OPTIONS = ['👤', '🕊️', '⚓', '🌿', '🌅', '🐋', '🐬', '🐙', '🐢', '🦀', '⛵', '🔥', '✨', '🍀', '🌈', '🌙', '🌊'];
const BORDER_OPTIONS = [
  { id: 'default', label: 'Default', cls: 'profile-avatar--default' },
  { id: 'gold', label: '👑 Gold Glow', cls: 'profile-avatar--gold' },
  { id: 'neon', label: '⚡ Neon Cyber', cls: 'profile-avatar--neon' },
  { id: 'ocean', label: '🌊 Ocean Wave', cls: 'profile-avatar--ocean' },
];

function getProfileUid() {
  const { user } = getState();
  const uid = getQueryParam('uid') || getQueryParam('id') || user?.uid;
  if (uid === 'undefined' || uid === 'null' || !uid) return user?.uid || '';
  return uid;
}
let profile = null;
let stories = [];
let bookmarkedStories = [];
let ledgerTransactions = [];
let activeTab = 'stories';
let isEditing = false;
let formState = {};
let loadedUid = null;

function el(id) { return pageEl(id); }

function isProfileMounted() {
  return detectCurrentPageKey() === 'profile' && !!pageEl('profile-root');
}

function borderClass(id) {
  return BORDER_OPTIONS.find(b => b.id === id)?.cls || 'profile-avatar--default';
}

function safeFormatDate(dateInput) {
  if (!dateInput) return 'Recently';
  try {
    if (typeof dateInput.toDate === 'function') {
      return dateInput.toDate().toLocaleDateString();
    }
    if (dateInput && typeof dateInput === 'object' && typeof dateInput.seconds === 'number') {
      return new Date(dateInput.seconds * 1000).toLocaleDateString();
    }
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return 'Recently';
    return d.toLocaleDateString();
  } catch (e) {
    return 'Recently';
  }
}

function formatTimeAgo(dateInput) {
  if (!dateInput) return t('time_just_now', 'Just now');
  let date;
  if (typeof dateInput.toDate === 'function') {
    date = dateInput.toDate();
  } else if (dateInput && typeof dateInput === 'object' && typeof dateInput.seconds === 'number') {
    date = new Date(dateInput.seconds * 1000);
  } else {
    date = new Date(dateInput);
  }
  if (isNaN(date.getTime())) return t('time_just_now', 'Just now');
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return t('time_just_now', 'Just now');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function loadBookmarkedStories() {
  try {
    let bookmarkedIds = [];
    const localSaved = localStorage.getItem('harbor_bookmarks');
    if (localSaved) {
      try {
        bookmarkedIds = JSON.parse(localSaved) || [];
      } catch (e) {
        console.error('Failed to parse bookmarks:', e);
      }
    }
    if (bookmarkedIds.length === 0) {
      bookmarkedIds = getState().bookmarks || [];
    }
    
    if (bookmarkedIds.length === 0) {
      bookmarkedStories = [];
      return;
    }

    const fetches = bookmarkedIds.slice(0, 15).map(async (storyId) => {
      try {
        const storySnap = await getDoc(doc(db, 'stories', storyId));
        if (storySnap.exists()) {
          return { id: storySnap.id, ...storySnap.data() };
        }
        return null;
      } catch (err) {
        console.warn(`Failed to fetch bookmarked story ${storyId}:`, err);
        return null;
      }
    });

    const results = await Promise.all(fetches);
    bookmarkedStories = results.filter(s => s !== null);
    bookmarkedStories.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } catch (err) {
    console.error('Error loading bookmarks:', err);
  }
}

async function loadLedgerTransactions() {
  const profileUid = getProfileUid();
  try {
    let snap;
    try {
      snap = await getDocs(query(
        collection(db, 'goldTransactions'),
        where('toUid', '==', profileUid),
        orderBy('createdAt', 'desc')
      ));
    } catch (idxErr) {
      console.warn('Index missing for goldTransactions, falling back to simple query:', idxErr);
      snap = await getDocs(query(
        collection(db, 'goldTransactions'),
        where('toUid', '==', profileUid)
      ));
    }
    ledgerTransactions = [];
    snap.forEach(d => ledgerTransactions.push({ id: d.id, ...d.data() }));
    // Client-side sort fallback
    ledgerTransactions.sort((a, b) => {
      const timeA = a.createdAt ? (typeof a.createdAt.toDate === 'function' ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
      const timeB = b.createdAt ? (typeof b.createdAt.toDate === 'function' ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
      return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
    });
  } catch (err) {
    console.warn('Error loading ledger:', err);
    ledgerTransactions = [];
  }
}

function renderAchievementsSection(locked = false) {
  if (locked) {
    return `
      <section class="card">
        <h2 style="font-size:var(--text-sm);font-weight:700;border-bottom:1px solid var(--color-border);padding-bottom:0.5rem;margin-bottom:var(--space-md)">🏆 ${t('achievements_title', 'Achievements')}</h2>
        <div style="text-align:center;padding:1rem 0;color:var(--text-muted);font-size:var(--text-xs)">
          🔒 ${t('ach_locked', 'Locked')} – Follow this profile to view achievements.
        </div>
      </section>`;
  }
  return `<section class="card"><app-achievements id="profile-achievements"></app-achievements></section>`;
}

function render() {
  const root = el('profile-root');
  if (!root) return;

  // Render the split grid shell once if not already present
  if (!root.querySelector('#profile-left-mount')) {
    root.innerHTML = `
      <style>
        .profile-split-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 2rem;
          align-items: start;
          margin-top: 1rem;
        }
        @media (min-width: 1024px) {
          .profile-split-grid {
            grid-template-columns: 350px 1fr;
          }
        }
        .profile-banner-bg {
          height: 140px;
          background: linear-gradient(135deg, var(--color-primary-dark) 0%, #0d1117 100%);
          position: relative;
          overflow: hidden;
          border-radius: var(--radius-2xl);
          box-shadow: inset 0 0 40px rgba(0,0,0,0.6);
        }
        .profile-glass-card {
          background: rgba(255, 255, 255, 0.015);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: var(--radius-2xl);
          padding: 1.5rem;
          margin-top: -50px;
          position: relative;
          box-shadow: var(--shadow-xl);
        }
        .profile-tab-btn {
          flex: 1;
          padding: 0.75rem;
          border-radius: var(--radius-lg);
          border: 1px solid transparent;
          font-size: 0.6875rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          transition: all 0.2s ease;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.375rem;
          background: transparent;
          color: var(--text-muted);
        }
        .profile-tab-btn:hover {
          color: var(--text-primary);
          background: rgba(255,255,255,0.02);
        }
        .profile-tab-btn.active {
          background: var(--color-card) !important;
          color: var(--color-primary) !important;
          box-shadow: var(--shadow-md);
          border: 1px solid var(--color-border) !important;
        }
        .avatar-option.selected {
          background: var(--color-primary) !important;
          border-color: var(--color-primary) !important;
          color: #fff !important;
        }
      </style>
      <div class="profile-banner-wrap" style="position: relative; margin-bottom: 2rem;">
        <div class="profile-banner-bg">
          <div style="position: absolute; top: -20px; left: -20px; width: 150px; height: 150px; background: var(--color-primary); filter: blur(60px); opacity: 0.25; border-radius: 50%;"></div>
          <div style="position: absolute; bottom: -30px; right: 10%; width: 200px; height: 200px; background: #eab308; filter: blur(80px); opacity: 0.12; border-radius: 50%;"></div>
        </div>
        
        <div id="profile-left-mount"></div>
      </div>
      
      <div class="profile-split-grid animate-page-enter">
        <div id="profile-aside-mount"></div>
        <div id="profile-main-mount" style="display: flex; flex-direction: column; gap: 1.5rem;"></div>
      </div>

      <div id="users-modal" class="modal-overlay" hidden role="dialog" aria-modal="true">
        <div class="modal-panel"><button class="modal-close" id="users-close">✕</button>
          <h2 id="users-modal-title" style="font-size:var(--text-sm);font-weight:900;margin:0 0 1rem"></h2>
          <div id="users-list" style="max-height:15rem;overflow-y:auto"></div></div></div>
          
      <div id="gender-modal" class="modal-overlay" hidden role="dialog" aria-modal="true">
        <div class="modal-panel"><button class="modal-close" id="gender-close">✕</button>
          <h2 style="font-size:var(--text-sm);font-weight:900;margin:0 0 0.5rem">⚓ One-Time Gender Correction</h2>
          <p style="font-size:var(--text-xs);color:var(--text-muted);margin:0 0 1rem">You may correct your gender exactly once.</p>
          <select class="select" id="new-gender"><option value="🧔 Man">🧔 Man</option><option value="👩 Woman">👩 Woman</option>
            <option value="⚧️ Non-binary">⚧️ Non-binary</option><option value="🙅 Prefer not to say">🙅 Prefer not to say</option></select>
          <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem">
            <button class="btn btn--secondary" id="gender-cancel">Cancel</button>
            <button class="btn btn--primary" id="gender-apply">Apply Correction</button></div></div></div>
    `;
  }

  const leftMount = el('profile-left-mount');
  const asideMount = el('profile-aside-mount');
  const mainMount = el('profile-main-mount');

  if (!profile) return;

  const { user, userData } = getState();
  const profileUid = getProfileUid();
  const isOwn = user?.uid === profileUid;
  const isFollowing = userData?.following?.includes(profileUid);
  const isPrivateAndNotOwn = profile.isPublic === false && !isOwn;

  const goldEarned = stories.reduce((sum, s) => sum + (s.totalGold || s.goldReceived || 0), 0);
  const goldBalance = profile.goldBalance || 0;

  // Blocked check
  if (profile.profileBlocked && !userData?.isAdmin && !isOwn) {
    if (leftMount) {
      leftMount.innerHTML = `
        <div class="card page-error" style="margin-top: -30px; position: relative; z-index: 5;">
          <span style="font-size:2rem">⚠️</span>
          <h1>Profile Under Review</h1>
          <p style="font-weight:normal;font-size:var(--text-xs)">This profile is being held for manual administrative review.</p>
          <button class="btn btn--primary" id="back-feed" style="margin-top: 1rem;">Back to feed</button>
        </div>
      `;
      el('back-feed')?.addEventListener('click', () => navigateTo('feed'));
    }
    if (asideMount) asideMount.innerHTML = '';
    if (mainMount) mainMount.innerHTML = '';
    return;
  }

  const bCls = borderClass(isOwn ? (userData?.border || profile.border) : profile.border);

  // Private profile
  if (isPrivateAndNotOwn) {
    const lockMessage = user
      ? '🔒 This profile is private. Follow to view content.'
      : '🔒 This profile is private.';
    const showFollow = user && !isOwn;

    if (leftMount) {
      leftMount.innerHTML = `
        <div class="profile-glass-card" style="display: flex; flex-direction: column; align-items: center; text-align: center;">
          <div class="profile-avatar ${bCls}" style="width: 6.5rem; height: 6.5rem; min-width: 6.5rem; min-height: 6.5rem; max-width: 6.5rem; max-height: 6.5rem; flex-shrink: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 3.25rem; background: var(--bg-primary); border: 3px solid rgba(255,255,255,0.08); box-shadow: 0 8px 32px rgba(0,0,0,0.4); position: relative; margin-top: -4.5rem;">
            ${profile.avatar || '👤'}
            ${profile.isAdmin ? '<span class="profile-admin-badge" style="position: absolute; top: -0.25rem; right: -0.25rem; background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; font-size: 0.55rem; font-weight: 900; padding: 0.15rem 0.5rem; border-radius: var(--radius-full); box-shadow: 0 4px 12px rgba(217, 119, 6, 0.3); border: 1px solid rgba(255,255,255,0.2); white-space: nowrap;">👑 ADMIN</span>' : ''}
          </div>
          <div class="profile-info" style="margin-top: 1rem; width: 100%;">
            <h1 class="profile-name" id="profile-name-display" style="font-size: 1.5rem; font-weight: 900; margin: 0; color: var(--text-primary); text-shadow: 0 2px 10px rgba(0,0,0,0.3); justify-content: center; display: flex; align-items: center; gap: 0.35rem;">
              ${profile.name}${profile.emailVerified ? '<span class="profile-verified" style="background: var(--color-primary); color: #fff; width: 1.15rem; height: 1.15rem; border-radius: 50%; font-size: 0.6rem; display: inline-flex; align-items: center; justify-content: center; font-weight: 900; box-shadow: 0 2px 8px rgba(16,185,129,0.4);">✓</span>' : ''}
            </h1>
            <p id="profile-bio-display" style="font-size: var(--text-xs); color: var(--text-secondary); margin: 0.5rem auto 0; line-height: 1.5; font-weight: 500; max-width: 24rem; ${!profile.bio ? 'display: none;' : ''}">${esc(profile.bio || '')}</p>
            <p style="font-size: var(--text-sm); font-weight: 600; color: var(--text-muted); margin: 1rem 0;">${lockMessage}</p>
            ${showFollow ? `<div style="display: flex; gap: 0.5rem; justify-content: center; width: 100%;">
              <button class="btn ${isFollowing ? 'btn--secondary' : 'btn--primary'}" id="follow-btn" style="width: 100%; max-width: 12rem;">${isFollowing ? '✓ Following' : '➕ Follow'}</button>
            </div>` : ''}
            ${user ? `<button class="btn btn--danger btn--ghost" id="report-profile" style="margin-top: 0.75rem; font-size: 0.6875rem;">⚠️ Report Profile</button>` : ''}
          </div>
        </div>
      `;
    }

    if (asideMount) asideMount.innerHTML = renderAchievementsSection(true);
    if (mainMount) {
      mainMount.innerHTML = `
        <div class="card" style="text-align: center; padding: 4rem 2rem; color: var(--text-muted); border-style: dashed; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 250px;">
          <span style="font-size: 3rem; margin-bottom: 1rem; display: block;">🔒</span>
          <h3 style="font-weight: 800; color: var(--text-primary); margin: 0;">This profile is private</h3>
          <p style="font-size: var(--text-xs); color: var(--text-secondary); margin-top: 0.5rem; max-width: 18rem;">Follow this beacon holder to discover their shared stories, bookmarks, and community gold logs.</p>
        </div>
      `;
    }

    wireEvents(isOwn, true);
    return;
  }

  // PUBLIC PROFILE LAYOUT
  if (leftMount) {
    leftMount.innerHTML = `
      <div class="profile-glass-card" style="display: flex; flex-direction: column; align-items: center; text-align: center;">
        ${isOwn ? `<button class="profile-privacy-btn" id="toggle-privacy" style="position: absolute; top: 1rem; right: 1rem; font-size: 0.625rem; padding: 0.35rem 0.65rem;">${profile.isPublic !== false ? '🔓 Public' : '🔒 Private'}</button>` : ''}
        
        <div class="profile-avatar ${bCls}" style="width: 6.5rem; height: 6.5rem; min-width: 6.5rem; min-height: 6.5rem; max-width: 6.5rem; max-height: 6.5rem; flex-shrink: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 3.25rem; background: var(--bg-primary); border: 3px solid rgba(255,255,255,0.08); box-shadow: 0 8px 32px rgba(0,0,0,0.4); position: relative; margin-top: -4.5rem;">
          ${profile.avatar || '👤'}
          ${profile.isAdmin ? '<span class="profile-admin-badge" style="position: absolute; top: -0.25rem; right: -0.25rem; background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; font-size: 0.55rem; font-weight: 900; padding: 0.15rem 0.5rem; border-radius: var(--radius-full); box-shadow: 0 4px 12px rgba(217, 119, 6, 0.3); border: 1px solid rgba(255,255,255,0.2); white-space: nowrap;">👑 ADMIN</span>' : ''}
        </div>
        
        <div class="profile-info" style="margin-top: 1rem; width: 100%;">
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; justify-content: center;">
            <h1 class="profile-name" id="profile-name-display" style="font-size: 1.5rem; font-weight: 900; margin: 0; color: var(--text-primary); text-shadow: 0 2px 10px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 0.35rem;">
              ${profile.name}
              ${profile.emailVerified ? '<span class="profile-verified" style="background: var(--color-primary); color: #fff; width: 1.15rem; height: 1.15rem; border-radius: 50%; font-size: 0.6rem; display: inline-flex; align-items: center; justify-content: center; font-weight: 900; box-shadow: 0 2px 8px rgba(16,185,129,0.4);">✓</span>' : ''}
            </h1>
            ${profile.goldReceived >= 50 ? '<span style="background: rgba(245, 158, 11, 0.12); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 0.55rem; font-weight: 800; padding: 0.125rem 0.375rem; border-radius: var(--radius-full); text-transform: uppercase; letter-spacing: 0.05em; margin-left: 0.25rem;">🌟 Top Contributor</span>' : ''}
          </div>
          
          <p id="profile-bio-display" style="font-size: var(--text-xs); color: var(--text-secondary); margin: 0.5rem auto 0; line-height: 1.5; font-weight: 500; max-width: 24rem; ${!profile.bio ? 'display: none;' : ''}">${esc(profile.bio || '')}</p>
          
          <div style="display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.75rem; font-size: 0.6875rem; color: var(--text-muted); font-weight: 500; align-items: center;">
            <div style="display: flex; align-items: center; gap: 0.375rem;">📍 <span>${profile.country || 'International'}</span> • 👤 <span>${profile.gender || 'Prefer not to say'}</span></div>
            <div style="display: flex; align-items: center; gap: 0.375rem;">📅 <span>Joined ${safeFormatDate(profile.createdAt)}</span></div>
          </div>
          
          <div style="display: flex; gap: 0.5rem; justify-content: center; margin-top: 1.25rem; flex-wrap: wrap; width: 100%;">
            ${isOwn ? `
              <button class="btn btn--primary" id="edit-toggle" style="flex: 1; min-width: 100px; padding: 0.5rem 1rem; font-size: 0.75rem;">${isEditing ? 'Cancel Edit' : '⚙️ Edit Profile'}</button>
            ` : user ? `
              <button class="btn ${isFollowing ? 'btn--secondary' : 'btn--primary'}" id="follow-btn" style="flex: 1; min-width: 120px; padding: 0.5rem 1rem; font-size: 0.75rem;">${isFollowing ? '✓ Following' : '➕ Follow'}</button>
              <button class="btn btn--danger btn--ghost" id="report-profile" style="padding: 0.5rem 0.75rem; font-size: 0.75rem;">⚠️ Report</button>
            ` : ''}
          </div>

          <!-- Stat Cluster Node -->
          <div class="stat-cluster-node" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; background: rgba(0, 0, 0, 0.15); border: 1px solid rgba(255, 255, 255, 0.03); border-radius: var(--radius-xl); padding: 0.75rem; margin-top: 1.25rem; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);">
            <div class="profile-stat profile-stat--clickable" data-list="followers" style="text-align: center; cursor: pointer;">
              <span class="profile-stat-value" style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); display: block;">${profile.followers?.length || 0}</span>
              <span class="profile-stat-label" style="font-size: 0.5rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; display: block; margin-top: 0.15rem;">Followers</span>
            </div>
            <div class="profile-stat profile-stat--clickable" data-list="following" style="text-align: center; cursor: pointer;">
              <span class="profile-stat-value" style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); display: block;">${profile.following?.length || 0}</span>
              <span class="profile-stat-label" style="font-size: 0.5rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; display: block; margin-top: 0.15rem;">Following</span>
            </div>
            <div class="profile-stat" style="text-align: center;">
              <span class="profile-stat-value" style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); display: block;">❤️ ${profile.likesReceived || 0}</span>
              <span class="profile-stat-label" style="font-size: 0.5rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; display: block; margin-top: 0.15rem;">Likes</span>
            </div>
            <div class="profile-stat" style="text-align: center;">
              <span class="profile-stat-value" style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); display: block;">🪙 ${goldEarned}</span>
              <span class="profile-stat-label" style="font-size: 0.5rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; display: block; margin-top: 0.15rem;">Gold</span>
            </div>
          </div>

          ${isOwn ? `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; padding: 0.5rem 0.75rem; background: rgba(16, 185, 129, 0.04); border: 1px solid rgba(16, 185, 129, 0.08); border-radius: var(--radius-lg); font-size: 0.6875rem;">
              <span style="color: var(--text-secondary); font-weight: 500;">🪙 Account Gold Balance</span>
              <span style="font-weight: 800; color: var(--color-primary);">${goldBalance} Gold</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  if (asideMount) {
    asideMount.innerHTML = `
      ${profile.status === 'RESTRICTED (Under 13)' ? `
        <div class="profile-warning-badge" style="
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.05));
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: var(--radius-xl);
          padding: 1rem;
          backdrop-filter: blur(8px);
          box-shadow: 0 4px 20px rgba(239, 68, 68, 0.05);
        ">
          <span style="font-size: 1.25rem;">🛡️</span>
          <div style="text-align: left;">
            <div style="font-weight: 800; color: #ef4444; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">
              Safety Restriction Active
            </div>
            <div style="color: var(--text-secondary); font-size: 0.6875rem; font-weight: 500; line-height: 1.3; margin-top: 0.125rem;">
              This account complies with children protection guidelines.
            </div>
          </div>
        </div>
      ` : ''}
      ${renderAchievementsSection(false)}
    `;
  }

  renderTabContent(isOwn);

  wireEvents(isOwn, false);
}

function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function renderTabContent(isOwn) {
  const mainMount = el('profile-main-mount');
  if (!mainMount) return;

  if (isOwn && isEditing) {
    mainMount.innerHTML = renderEditForm();
    handlePasswordInputs();
    return;
  }

  // Otherwise, render Tabs + active tab contents
  mainMount.innerHTML = `
    <div class="profile-tabs-dock" style="display: flex; gap: 0.375rem; background: var(--bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-xl); padding: 0.25rem;">
      <button class="profile-tab-btn${activeTab === 'stories' ? ' active' : ''}" data-profile-tab="stories" style="flex: 1;">
        📝 Stories (${stories.length})
      </button>
      <button class="profile-tab-btn${activeTab === 'bookmarks' ? ' active' : ''}" data-profile-tab="bookmarks" style="flex: 1;">
        🔖 Bookmarks
      </button>
      <button class="profile-tab-btn${activeTab === 'ledger' ? ' active' : ''}" data-profile-tab="ledger" style="flex: 1;">
        📊 Ledger
      </button>
    </div>
    <div id="profile-tab-panel" class="animate-page-enter" style="display: flex; flex-direction: column; gap: var(--space-md);"></div>
  `;

  // Bind click listeners to tabs
  mainMount.querySelectorAll('[data-profile-tab]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const tab = btn.dataset.profileTab;
      if (activeTab === tab) return;
      activeTab = tab;
      
      // Update tab active classes instantly
      mainMount.querySelectorAll('[data-profile-tab]').forEach(b => {
        b.classList.toggle('active', b.dataset.profileTab === activeTab);
      });

      renderActiveTabPanel();
    });
  });

  renderActiveTabPanel();
}

async function renderActiveTabPanel() {
  const panel = el('profile-tab-panel');
  if (!panel) return;

  if (activeTab === 'stories') {
    panel.innerHTML = '';
    if (stories.length === 0) {
      panel.innerHTML = `
        <div style="background: rgba(255,255,255,0.015); border: 1px solid var(--color-border); border-radius: var(--radius-xl); padding: 3rem 1.5rem; text-align: center; color: var(--text-muted);">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 0.75rem;">📝</span>
          <h3 style="margin: 0; font-weight: 700; color: var(--text-primary);">No stories shared yet</h3>
          <p style="font-size: var(--text-xs); color: var(--text-secondary); margin-top: 0.25rem;">Stories published will appear here once approved.</p>
        </div>
      `;
    } else {
      const { user } = getState();
      stories.forEach((story, idx) => {
        const card = document.createElement('app-story-card');
        card.setAttribute('story-id', story.id);
        card.setAttribute('author-id', story.userId || '');
        card.setAttribute('user-id', story.userId || '');
        card.setAttribute('title', story.title || '');
        card.setAttribute('text', story.text || '');
        card.setAttribute('author', story.authorName || 'Anonymous');
        card.setAttribute('category', story.category || 'general');
        card.setAttribute('date', formatTimeAgo(story.createdAt));
        if (story.isAnonymous) card.setAttribute('anonymous', '');
        card.setAttribute('gold', String(story.totalGold || story.goldReceived || 0));
        card.setAttribute('comments', String(story.commentCount || 0));
        card.setAttribute('views', String(story.views || 0));
        
        const isBookmarked = (getState().bookmarks || []).includes(story.id);
        if (isBookmarked) card.setAttribute('bookmarked', '');

        card.style.animationDelay = `${Math.min(idx * 0.05, 0.4)}s`;
        panel.appendChild(card);

        card.setReactions(story.reactions || {}, [], () => {});
        card.showGoldButton(user && story.userId !== user.uid);
        card.setNavigateHandler((id) => navigateTo('story', { id }));
      });
    }
  } else if (activeTab === 'bookmarks') {
    panel.innerHTML = '<app-skeleton-stories count="2"></app-skeleton-stories>';
    
    // Check if we need to load bookmarks
    const localSaved = localStorage.getItem('harbor_bookmarks');
    let savedIds = [];
    if (localSaved) {
      try { savedIds = JSON.parse(localSaved) || []; } catch(e){}
    }
    if (savedIds.length === 0) {
      savedIds = getState().bookmarks || [];
    }
    
    if (savedIds.length === 0) {
      panel.innerHTML = `
        <div style="background: rgba(255,255,255,0.015); border: 1px solid var(--color-border); border-radius: var(--radius-xl); padding: 3rem 1.5rem; text-align: center; color: var(--text-muted);">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 0.75rem;">🔖</span>
          <h3 style="margin: 0; font-weight: 700; color: var(--text-primary);">No saved bookmarks</h3>
          <p style="font-size: var(--text-xs); color: var(--text-secondary); margin-top: 0.25rem;">Click the bookmark icon on any story to save it here.</p>
        </div>
      `;
      return;
    }

    if (bookmarkedStories.length === 0) {
      await loadBookmarkedStories();
    }

    panel.innerHTML = '';
    if (bookmarkedStories.length === 0) {
      panel.innerHTML = `
        <div style="background: rgba(255,255,255,0.015); border: 1px solid var(--color-border); border-radius: var(--radius-xl); padding: 3rem 1.5rem; text-align: center; color: var(--text-muted);">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 0.75rem;">🔖</span>
          <h3 style="margin: 0; font-weight: 700; color: var(--text-primary);">No saved bookmarks</h3>
          <p style="font-size: var(--text-xs); color: var(--text-secondary); margin-top: 0.25rem;">Click the bookmark icon on any story to save it here.</p>
        </div>
      `;
    } else {
      const { user } = getState();
      bookmarkedStories.forEach((story, idx) => {
        const card = document.createElement('app-story-card');
        card.setAttribute('story-id', story.id);
        card.setAttribute('author-id', story.userId || '');
        card.setAttribute('user-id', story.userId || '');
        card.setAttribute('title', story.title || '');
        card.setAttribute('text', story.text || '');
        card.setAttribute('author', story.authorName || 'Anonymous');
        card.setAttribute('category', story.category || 'general');
        card.setAttribute('date', formatTimeAgo(story.createdAt));
        if (story.isAnonymous) card.setAttribute('anonymous', '');
        card.setAttribute('gold', String(story.totalGold || story.goldReceived || 0));
        card.setAttribute('comments', String(story.commentCount || 0));
        card.setAttribute('views', String(story.views || 0));
        card.setAttribute('bookmarked', '');

        card.style.animationDelay = `${Math.min(idx * 0.05, 0.4)}s`;
        panel.appendChild(card);

        card.setReactions(story.reactions || {}, [], () => {});
        card.showGoldButton(user && story.userId !== user.uid);
        card.setNavigateHandler((id) => navigateTo('story', { id }));
      });
    }
  } else if (activeTab === 'ledger') {
    panel.innerHTML = '<app-skeleton-stories count="1"></app-skeleton-stories>';
    
    if (ledgerTransactions.length === 0) {
      await loadLedgerTransactions();
    }
    
    panel.innerHTML = renderLedgerTab();
  }
}

function renderLedgerTab() {
  if (!ledgerTransactions.length) {
    return `
      <div style="background: rgba(255,255,255,0.015); border: 1px solid var(--color-border); border-radius: var(--radius-xl); padding: 2rem; text-align: center; color: var(--text-muted);">
        <span style="font-size: 2.5rem; display: block; margin-bottom: 0.75rem;">📊</span>
        <h3 style="margin: 0; font-weight: 700; color: var(--text-primary);">No ledger records</h3>
        <p style="font-size: var(--text-xs); color: var(--text-secondary); margin-top: 0.25rem;">Support the community or receive gold to generate ledger history.</p>
      </div>
    `;
  }

  const totalGold = ledgerTransactions.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
  const supportersCount = new Set(ledgerTransactions.map(t => t.fromUid)).size;
  const topGift = Math.max(...ledgerTransactions.map(t => parseFloat(t.amount) || 0), 0);

  return `
    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
      <!-- Analytics Dock -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
        <div class="card" style="padding: 1rem; text-align: center; background: rgba(16,185,129,0.04); border-color: rgba(16,185,129,0.15);">
          <div style="font-size: 1.25rem; font-weight: 900; color: var(--color-primary);">🪙 ${totalGold}</div>
          <div style="font-size: 0.55rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-top: 0.25rem;">Total Earned</div>
        </div>
        <div class="card" style="padding: 1rem; text-align: center; background: rgba(59,130,246,0.04); border-color: rgba(59,130,246,0.15);">
          <div style="font-size: 1.25rem; font-weight: 900; color: #60a5fa;">👥 ${supportersCount}</div>
          <div style="font-size: 0.55rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-top: 0.25rem;">Supporters</div>
        </div>
        <div class="card" style="padding: 1rem; text-align: center; background: rgba(245,158,11,0.04); border-color: rgba(245,158,11,0.15);">
          <div style="font-size: 1.25rem; font-weight: 900; color: #fbbf24;">👑 ${topGift}</div>
          <div style="font-size: 0.55rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-top: 0.25rem;">Highest Gift</div>
        </div>
      </div>

      <!-- Logs -->
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <h3 style="font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; margin: 0 0 0.25rem;">Transaction Logs</h3>
        ${ledgerTransactions.map(tx => `
          <div class="card" style="padding: 1rem; display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; background: rgba(255,255,255,0.01);">
            <div>
              <div style="font-size: var(--text-xs); font-weight: 700; color: var(--text-primary);">
                Received <span style="color: #fbbf24; font-weight: 800;">${tx.amount} 🪙</span> from <span style="color: var(--color-primary);">${esc(tx.fromName || 'Anonymous')}</span>
              </div>
              ${tx.message ? `<div style="font-size: 0.6875rem; font-style: italic; color: var(--text-secondary); margin-top: 0.25rem;">"${esc(tx.message)}"</div>` : ''}
              ${tx.storyTitle ? `<div style="font-size: 0.625rem; color: var(--text-muted); margin-top: 0.25rem;">Story: "${esc(tx.storyTitle)}"</div>` : ''}
            </div>
            <div style="font-size: 0.625rem; color: var(--text-muted); white-space: nowrap;">
              ${safeFormatDate(tx.createdAt)}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderEditForm() {
  const s = formState;
  return `
    <form class="card animate-page-enter" id="profile-form" style="display: flex; flex-direction: column; gap: 1rem; padding: 1.5rem; margin-top: 0;">
      <h2 style="font-size:var(--text-base);font-weight:800;border-bottom:1px solid var(--color-border);padding-bottom:0.5rem;margin:0">⚙️ Edit Customization Profile</h2>
      
      <div>
        <label class="label" style="font-size: 0.6875rem;">Username</label>
        <input class="input" id="pf-name" maxlength="30" value="${esc(s.username)}" required style="width: 100%;">
      </div>
      
      <div>
        <label class="label" style="font-size: 0.6875rem;">Short Bio</label>
        <textarea class="textarea" id="pf-bio" maxlength="160" rows="2" style="width: 100%;" placeholder="Describe yourself...">${esc(profile.bio || '')}</textarea>
      </div>
      
      <div>
        <label class="label" style="font-size: 0.6875rem;">Birthday</label>
        <input type="date" class="input" id="pf-birthday" value="${esc(s.birthday || '')}" required style="width: 100%;">
      </div>
      
      <div>
        <label class="label" style="font-size: 0.6875rem;">Gender</label>
        <div class="input" style="opacity:0.7; width: 100%; display: flex; align-items: center; background: var(--bg-secondary); border-color: var(--color-border);">${esc(profile.gender || 'Prefer not to say')} (Locked)</div>
        <p style="font-size:0.625rem;color:var(--text-muted);margin-top:0.25rem;">ℹ️ ${profile.genderCorrected ? 'You have already used your one-time correction.' : '<button type="button" id="gender-open" style="color:var(--color-primary);font-weight:800;background:none;border:none;cursor:pointer;font-family:inherit;padding:0">Submit a one-time gender correction request</button>'}</p>
      </div>
      
      <div>
        <label class="label" style="font-size: 0.6875rem; margin-bottom: 0.5rem; display: block;">Select Avatar</label>
        <div class="avatar-grid" style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.5rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-xl); border: 1px solid var(--color-border);">${AVATAR_OPTIONS.map(av => `<button type="button" class="avatar-option${s.avatar === av ? ' selected' : ''}" data-avatar="${av}" style="width: 2.5rem; height: 2.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; border: 1px solid var(--color-border); background: var(--color-card); cursor: pointer; transition: all 0.15s;">${av}</button>`).join('')}</div>
      </div>
      
      <div>
        <label class="label" style="font-size: 0.6875rem; margin-bottom: 0.5rem; display: block;">Select Border Aura</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">${BORDER_OPTIONS.map(b => `<button type="button" class="btn ${s.border === b.id ? 'btn--primary' : 'btn--secondary'}" data-border="${b.id}" style="font-size: 0.6875rem; padding: 0.5rem;">${b.label}</button>`).join('')}</div>
      </div>
      
      <div>
        <label class="label" style="font-size: 0.6875rem;">Language</label>
        <select class="select" id="pf-lang" style="width: 100%;"><option value="en">🇺🇸 English</option><option value="fr">🇫🇷 Français</option><option value="ru">🇷🇺 Русский</option>
          <option value="ja">🇯🇵 日本語</option><option value="ar">🇸🇦 العربية</option><option value="zh">🇨🇳 中文</option><option value="bn">🇧🇩 বাংলা</option></select>
      </div>
      
      <div class="form-row" style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0; border-top: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); margin-top: 0.5rem;">
        <div>
          <label style="font-size:0.75rem;font-weight:700;display:block;">Public Visibility</label>
          <span class="form-row__hint" style="font-size: 0.625rem; color: var(--text-muted); display:block;">Only approved followers can view private profiles.</span>
        </div>
        <input type="checkbox" id="pf-public" ${s.isPublic ? 'checked' : ''} style="width: 1.25rem; height: 1.25rem; cursor: pointer;">
      </div>

      <!-- Sleek Password Edit Section -->
      <div class="card" style="margin-top:1rem; border:1px dashed var(--color-border); background:rgba(255,255,255,0.01); padding:1.25rem; border-radius:var(--radius-lg)">
        <h3 style="font-size:var(--text-sm); font-weight:800; margin:0 0 0.75rem; display:flex; align-items:center; gap:0.5rem">🔒 Change Account Password</h3>
        
        <div id="pw-edit-error" class="error-banner" style="display:none; margin-bottom:0.75rem; padding:0.5rem; font-size:0.75rem; background:rgba(239, 68, 68, 0.1); color:var(--color-danger); border-left:3px solid var(--color-danger);"></div>
        <div id="pw-edit-success" class="success-banner" style="display:none; margin-bottom:0.75rem; padding:0.5rem; font-size:0.75rem; background:rgba(16, 185, 129, 0.1); color:var(--color-success); border-left:3px solid var(--color-success);"></div>
        
        <div class="field" style="margin-bottom:0.75rem">
          <label class="label" style="font-size:0.6875rem">Current (Old) Password</label>
          <input type="password" class="input" id="pw-old" placeholder="Current password" style="background:var(--bg-primary); width:100%;" autocomplete="current-password">
        </div>

        <div class="field" style="margin-bottom:0.75rem">
          <label class="label" style="font-size:0.6875rem">New Password</label>
          <input type="password" class="input" id="pw-new" placeholder="Min 6 chars" style="background:var(--bg-primary); width:100%;" autocomplete="new-password" disabled>
          <div id="pw-strength-indicator" style="font-size:0.625rem; font-weight:700; margin-top:0.25rem"></div>
        </div>
        
        <div class="field" style="margin-bottom:0.75rem">
          <label class="label" style="font-size:0.6875rem">Confirm New Password</label>
          <input type="password" class="input" id="pw-confirm" placeholder="Confirm password" style="background:var(--bg-primary); width:100%;" autocomplete="new-password" disabled>
          <div id="pw-mismatch-indicator" style="font-size:0.625rem; color:var(--color-danger); font-weight:700; margin-top:0.25rem"></div>
        </div>
        
        <button type="button" class="btn btn--primary" id="pw-submit-btn" style="width:100%; margin-top:0.5rem; padding:0.5rem; font-size:0.75rem">
          <span id="pw-btn-text">Update Password</span>
        </button>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem;flex-wrap:wrap;gap:1rem;">
        <button type="button" class="btn btn--ghost" style="color:var(--color-danger); padding: 0.5rem 0;" id="delete-account-link">⚠️ Permanent Account Deletion</button>
        <div style="display:flex; gap:0.5rem;">
          <button type="button" class="btn btn--secondary" id="form-cancel-btn" style="padding: 0.5rem 1.25rem;">Cancel</button>
          <button type="submit" class="btn btn--primary" style="padding: 0.5rem 1.5rem;">💾 Save Custom Profile</button>
        </div>
      </div>
    </form>
  `;
}

function getPasswordStrength(password) {
  if (!password) return { label: '', cls: '' };
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;
  if (score >= 4) return { label: 'Very Strong', cls: 'text-success' };
  if (score >= 3) return { label: 'Strong', cls: 'text-success' };
  if (score >= 2) return { label: 'Medium', cls: 'text-warning' };
  return { label: 'Weak', cls: 'text-danger' };
}

function handlePasswordInputs() {
  const oldPwEl = el('pw-old');
  const newPwEl = el('pw-new');
  const confirmPwEl = el('pw-confirm');
  const strengthEl = el('pw-strength-indicator');
  const mismatchEl = el('pw-mismatch-indicator');
  
  if (oldPwEl) {
    oldPwEl.addEventListener('input', () => {
      const isFilled = oldPwEl.value.trim().length > 0;
      if (newPwEl) newPwEl.disabled = !isFilled;
      if (confirmPwEl) confirmPwEl.disabled = !isFilled;
    });
  }
  
  if (newPwEl && strengthEl) {
    newPwEl.addEventListener('input', () => {
      const val = newPwEl.value;
      if (!val) {
        strengthEl.textContent = '';
        return;
      }
      const strength = getPasswordStrength(val);
      strengthEl.textContent = `Strength: ${strength.label}`;
      // Map classes explicitly or set style color
      if (strength.cls === 'text-success') strengthEl.style.color = 'var(--color-success)';
      else if (strength.cls === 'text-warning') strengthEl.style.color = '#eab308';
      else strengthEl.style.color = 'var(--color-danger)';
      
      if (confirmPwEl && confirmPwEl.value) {
        if (val !== confirmPwEl.value) {
          mismatchEl.textContent = '⚠️ Passwords do not match';
        } else {
          mismatchEl.textContent = '';
        }
      }
    });
  }
  
  if (confirmPwEl && mismatchEl) {
    confirmPwEl.addEventListener('input', () => {
      const val = confirmPwEl.value;
      const newPw = newPwEl ? newPwEl.value : '';
      if (!val) {
        mismatchEl.textContent = '';
        return;
      }
      if (val !== newPw) {
        mismatchEl.textContent = '⚠️ Passwords do not match';
      } else {
        mismatchEl.textContent = '';
      }
    });
  }
}

async function handlePasswordUpdate(e) {
  if (e) e.preventDefault();
  
  const errEl = el('pw-edit-error');
  const succEl = el('pw-edit-success');
  const submitBtn = el('pw-submit-btn');
  const btnText = el('pw-btn-text');
  
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  if (succEl) { succEl.style.display = 'none'; succEl.textContent = ''; }
  
  const oldPw = el('pw-old')?.value || '';
  const newPw = el('pw-new')?.value || '';
  const confirmPw = el('pw-confirm')?.value || '';
  
  if (!oldPw) {
    if (errEl) { errEl.textContent = 'Please enter your current password.'; errEl.style.display = 'block'; }
    return;
  }

  if (!newPw) {
    if (errEl) { errEl.textContent = 'Please enter a new password.'; errEl.style.display = 'block'; }
    return;
  }
  
  if (newPw.length < 6) {
    if (errEl) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; }
    return;
  }
  
  if (newPw !== confirmPw) {
    if (errEl) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; }
    return;
  }
  
  if (submitBtn) submitBtn.disabled = true;
  if (btnText) btnText.innerHTML = `⏳ Updating...`;
  
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No authenticated user session found. Please log in again.');
    }
    
    // Re-authenticate user first
    const credential = EmailAuthProvider.credential(user.email, oldPw);
    await reauthenticateWithCredential(user, credential);
    
    // Perform password update
    await updatePassword(user, newPw);
    
    if (succEl) { succEl.textContent = '🔒 Password successfully updated!'; succEl.style.display = 'block'; }
    showToast('🔒 Password updated successfully!', 'success');
    
    if (el('pw-old')) el('pw-old').value = '';
    if (el('pw-new')) el('pw-new').value = '';
    if (el('pw-confirm')) el('pw-confirm').value = '';
    if (el('pw-strength-indicator')) el('pw-strength-indicator').textContent = '';
    if (el('pw-mismatch-indicator')) el('pw-mismatch-indicator').textContent = '';
  } catch (err) {
    console.error('Password update failed:', err);
    let errMsg = err?.message || 'Failed to update password.';
    if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password') {
      errMsg = 'Incorrect current password. Please try again.';
    } else if (err?.code === 'auth/requires-recent-login') {
      errMsg = 'Security action required: Please log out and log in again to update your password.';
    }
    if (errEl) { errEl.textContent = errMsg; errEl.style.display = 'block'; }
    showToast(`❌ ${errMsg}`, 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (btnText) btnText.textContent = 'Update Password';
  }
}

function wireEvents(isOwn, isPrivateAndNotOwn) {
  document.querySelector('app-achievements')?.setProfile(profile);

  const resetFormState = () => {
    if (!profile) return;
    formState = {
      username: profile.name || '',
      avatar: profile.avatar || '👤',
      border: profile.border || 'default',
      language: profile.language || 'en',
      isPublic: profile.isPublic !== false,
      birthday: profile.birthday || '',
    };
  };

  el('edit-toggle')?.addEventListener('click', (e) => {
    e.preventDefault();
    isEditing = !isEditing;
    if (!isEditing) {
      resetFormState();
    }
    render();
  });

  el('form-cancel-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    isEditing = false;
    resetFormState();
    render();
  });
  el('nav-bookmarks-btn')?.addEventListener('click', (e) => { e.preventDefault(); navigateTo('bookmarks'); });
  el('follow-btn')?.addEventListener('click', () => followUser(getProfileUid()));
  el('report-profile')?.addEventListener('click', handleReportProfile);
  el('toggle-privacy')?.addEventListener('click', handleTogglePrivacy);
  document.querySelectorAll('[data-story]').forEach(card => {
    card.addEventListener('click', () => navigateTo('story', { id: card.dataset.story }));
  });

  document.querySelectorAll('[data-list]').forEach(stat => {
    stat.addEventListener('click', () => handleOpenUsersModal(stat.dataset.list));
  });

  el('profile-form')?.addEventListener('submit', handleUpdateProfile);
  el('pf-lang') && (el('pf-lang').value = formState.language);
  document.querySelectorAll('[data-avatar]').forEach(btn => {
    btn.addEventListener('click', () => {
      formState.avatar = btn.dataset.avatar;
      const avatarEl = document.querySelector('.profile-avatar');
      if (avatarEl) {
        const badge = avatarEl.querySelector('.profile-admin-badge');
        avatarEl.textContent = formState.avatar;
        if (badge) avatarEl.appendChild(badge);
      }
      document.querySelectorAll('[data-avatar]').forEach(b => {
        b.classList.toggle('selected', b.dataset.avatar === formState.avatar);
      });
    });
  });
  document.querySelectorAll('[data-border]').forEach(btn => {
    btn.addEventListener('click', () => {
      formState.border = btn.dataset.border;
      const avatarEl = document.querySelector('.profile-avatar');
      if (avatarEl) {
        avatarEl.className = 'profile-avatar ' + borderClass(formState.border);
      }
      document.querySelectorAll('[data-border]').forEach(b => {
        const isSelected = b.dataset.border === formState.border;
        b.className = `btn ${isSelected ? 'btn--primary' : 'btn--secondary'}`;
      });
    });
  });
  el('gender-open')?.addEventListener('click', () => { el('gender-modal').hidden = false; el('new-gender').value = profile.gender || '🙅 Prefer not to say'; });
  el('gender-close')?.addEventListener('click', () => el('gender-modal').hidden = true);
  el('gender-cancel')?.addEventListener('click', () => el('gender-modal').hidden = true);
  el('gender-apply')?.addEventListener('click', handleGenderCorrection);
  el('users-close')?.addEventListener('click', () => el('users-modal').hidden = true);
  el('delete-account-link')?.addEventListener('click', () => navigateTo('delete-account'));

  if (isOwn && isEditing) {
    handlePasswordInputs();
    el('pw-submit-btn')?.addEventListener('click', handlePasswordUpdate);
  }
}

async function loadProfile() {
  const { user } = getState();
  const profileUid = getProfileUid();
  const root = el('profile-root');
  if (!root) return;
  if (!profileUid) { root.innerHTML = '<div class="page-error">No user selected.</div>'; return; }
  if (!user) return;
  
  let isBackground = false;
  if (profile && (profile.uid === profileUid || (isEditing && profile.uid === user.uid))) {
    isBackground = true;
    render();
  } else {
    // Reset caches for different user
    bookmarkedStories = [];
    ledgerTransactions = [];
    
    // Sophisticated Zero-Flicker structural layout isolated skeleton screen
    root.innerHTML = `
      <div style="max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem;">
        <div style="height: 140px; background: rgba(255,255,255,0.015); border-radius: var(--radius-2xl); border: 1px solid var(--color-border); position: relative;"></div>
        <div class="profile-split-grid animate-page-enter" style="display: grid; gap: 2rem; align-items: start; margin-top: 1rem;">
          <div style="height: 250px; background: rgba(255,255,255,0.015); border-radius: var(--radius-2xl); border: 1px solid var(--color-border);"></div>
          <div style="display: flex; flex-direction: column; gap: 1.5rem;">
            <app-skeleton-stories count="2"></app-skeleton-stories>
          </div>
        </div>
      </div>
    `;
  }
  try {
    const docSnap = await getDoc(doc(db, 'users', profileUid));
    const currentRoot = el('profile-root');
    if (!currentRoot) return;
    if (!docSnap.exists()) { currentRoot.innerHTML = '<div class="page-error">User not found.</div>'; return; }
    profile = { uid: docSnap.id, ...docSnap.data(), emailVerified: docSnap.data().emailVerified || user?.emailVerified || false };
    formState = {
      username: profile.name || '', avatar: profile.avatar || '👤', border: profile.border || 'default',
      language: profile.language || 'en', isPublic: profile.isPublic !== false,
      birthday: profile.birthday || '',
    };
    const isOwn = user?.uid === profileUid;
    const isFollowing = getState().userData?.following?.includes(profileUid);
    if (profile.isPublic !== false || isOwn || isFollowing) {
      let snap;
      try {
        const sq = query(collection(db, 'stories'), where('userId', '==', profileUid), where('approved', '==', true), orderBy('createdAt', 'desc'));
        snap = await getDocs(sq);
        stories = [];
        snap.forEach(d => stories.push({ id: d.id, ...d.data() }));
      } catch (idxErr) {
        console.warn('Index not ready/missing for approved + orderBy query, falling back to simple query', idxErr);
        try {
          const sqFallback = isOwn
            ? query(collection(db, 'stories'), where('userId', '==', profileUid))
            : query(collection(db, 'stories'), where('userId', '==', profileUid), where('approved', '==', true), where('visibility', '==', 'public'));
          snap = await getDocs(sqFallback);
          stories = [];
          snap.forEach(d => {
            const data = d.data();
            if (isOwn || (data.approved === true && data.visibility === 'public')) {
              stories.push({ id: d.id, ...data });
            }
          });
          stories.sort((a, b) => {
            const timeA = a.createdAt ? (typeof a.createdAt.toDate === 'function' ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
            const timeB = b.createdAt ? (typeof b.createdAt.toDate === 'function' ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
            return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
          });
        } catch (fallbackErr) {
          console.error('Failed both queries:', fallbackErr);
          stories = [];
        }
      }
    } else stories = [];
    
    // Auto-trigger edit mode if hash is #password or ends with #password
    if (isOwn && (window.location.hash === '#password' || window.location.hash.endsWith('#password'))) {
      isEditing = true;
    }
    
    render();
    
    // Smooth scroll to password edit card
    if (isOwn && (window.location.hash === '#password' || window.location.hash.endsWith('#password'))) {
      setTimeout(() => {
        el('pw-new')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el('pw-new')?.focus();
      }, 300);
    }
  } catch (err) {
    const currentRoot = el('profile-root');
    if (currentRoot) {
      if (err.code === 'permission-denied' || err.message?.includes('permission') || err.message?.includes('Missing or insufficient permissions')) {
        currentRoot.innerHTML = `
          <div style="max-width: 600px; margin: 4rem auto; text-align: center; padding: 3rem 1.5rem; background: rgba(255,255,255,0.015); border: 1px solid var(--color-border); border-radius: var(--radius-2xl);">
            <span style="font-size: 3rem; display: block; margin-bottom: 1rem;">🔒</span>
            <h2 style="font-weight: 800; color: var(--text-primary); margin: 0 0 0.5rem;">Private Profile</h2>
            <p style="font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.5; margin: 0 auto; max-width: 24rem;">This profile is private or requires verification. Follow this beacon holder or sign in to connect.</p>
            <button class="btn btn--primary" style="margin-top: 1.5rem;" id="pvt-back-btn">Back to feed</button>
          </div>
        `;
        document.getElementById('pvt-back-btn')?.addEventListener('click', () => navigateTo('feed'));
      } else {
        currentRoot.innerHTML = `<div class="page-error">${err.message}</div>`;
      }
    }
  }
}

async function handleTogglePrivacy() {
  const profileUid = getProfileUid();
  try {
    const newPrivacy = profile.isPublic === false;
    await updateDoc(doc(db, 'users', profileUid), { isPublic: newPrivacy });
    profile.isPublic = newPrivacy;
    formState.isPublic = newPrivacy;
    if (profileUid === getState().user?.uid) {
      patchUserData({ isPublic: newPrivacy });
    }
    showToast(newPrivacy ? '🔓 Profile is now Public' : '🔒 Profile is now Private', 'success');
    render();
  } catch (err) { showToast(`Error: ${err.message}`, 'error'); }
}

async function handleUpdateProfile(e) {
  e.preventDefault();
  const { user } = getState();
  const trimmedName = el('pf-name').value.trim();
  const err = validateUsername(trimmedName);
  if (err) { showToast(err, 'warning'); return; }
  if (checkVulgarWords(trimmedName)) {
    const errorMsg = 'Inappropriate words detected. Submission blocked to keep The Harbor safe.';
    showToast(`⚠️ ${errorMsg}`, 'error');
    logFlaggedAttempt({ username: trimmedName }, 'profile-update');
    return;
  }
  if (trimmedName !== profile.name) {
    try {
      const uq = query(collection(db, 'users'), where('isPublic', '==', true), where('name', '==', trimmedName));
      const us = await getDocs(uq);
      if (!us.empty) { showToast('Username already taken.', 'warning'); return; }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'users');
    }
  }
  const birthdayVal = el('pf-birthday').value;
  const statusVal = getStatusForBirthday(birthdayVal);
  const updateData = {
    name: trimmedName, avatar: formState.avatar, border: formState.border,
    bio: el('pf-bio')?.value.trim() || '',
    isPublic: el('pf-public').checked, language: el('pf-lang').value,
    birthday: birthdayVal, status: statusVal,
  };
  try {
    await updateDoc(doc(db, 'users', user.uid), updateData);
    await changeLanguage(updateData.language);
    Object.assign(profile, updateData);
    if (getState().userData) patchUserData(updateData);
    isEditing = false;
    formState = { ...formState, ...updateData };
    showToast(t('profile_updated', '🎉 Profile updated successfully!'), 'success');
    render();
  } catch (err) { showToast(`❌ Update failed: ${err.message}`, 'error'); }
}

async function handleGenderCorrection() {
  const profileUid = getProfileUid();
  if (profile.genderCorrected) { showToast('❌ You have already modified your gender once.', 'error'); return; }
  try {
    const g = el('new-gender').value;
    await updateDoc(doc(db, 'users', profileUid), { gender: g, genderCorrected: true });
    showToast(t('gender_corrected', '🎉 Gender corrected!'), 'success');
    profile.gender = g;
    profile.genderCorrected = true;
    if (profileUid === getState().user?.uid) {
      patchUserData({ gender: g, genderCorrected: true });
    }
    el('gender-modal').hidden = true;
    render();
  } catch (err) { showToast(`Error: ${err.message}`, 'error'); }
}

async function handleOpenUsersModal(type) {
  const profileUid = getProfileUid();
  const isOwn = getState().user?.uid === profileUid;
  if (profile.isPublic === false && !isOwn) {
    showToast('🔒 This profile is private.', 'info'); return;
  }
  const uids = type === 'followers' ? (profile.followers || []) : (profile.following || []);
  if (!uids.length) { showToast(`No ${type} to display.`, 'info'); return; }
  el('users-modal-title').textContent = type === 'followers' ? 'Followers' : 'Following';
  const usersList = el('users-list');
  if (!usersList) return;
  usersList.innerHTML = '<div class="page-empty">Loading...</div>';
  el('users-modal') && (el('users-modal').hidden = false);
  const list = [];
  for (const uid of uids.slice(0, 30)) {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) list.push({ uid, ...snap.data() });
  }
  usersList.innerHTML = list.length ? list.map(u => `
    <div class="user-list-item" data-uid="${u.uid}"><span style="font-size:1.5rem">${u.avatar || '👤'}</span>
      <div><div style="font-size:var(--text-xs);font-weight:700">${esc(u.name)}</div>
      <div style="font-size:0.625rem;color:var(--text-muted)">📍 ${u.country || 'International'}</div></div></div>`).join('') : '<div class="page-empty">No users found.</div>';
  document.querySelectorAll('#users-list [data-uid]').forEach(item => {
    item.addEventListener('click', () => { el('users-modal').hidden = true; navigateTo('profile', { uid: item.dataset.uid }); });
  });
}

function handleReportProfile() {
  const { user } = getState();
  if (!user) {
    showToast('🔐 Please sign in to report a profile.', 'warning');
    return;
  }
  if (!user.emailVerified) {
    showToast(t('verify_email_first', '📧 Please verify your email first.'), 'warning');
    return;
  }
  const profileUid = getProfileUid();
  showConfirm('⚠️ Report User Profile', 'Please state the reason for flagging this profile.', true, async (reason) => {
    const { userData } = getState();
    const VULGAR = /\b(shit|fuck|damn|asshole|bitch|crap|vulgar|bastard|dick|pussy|cunt)\b/i;
    const isVulgar = VULGAR.test(`${profile.name || ''} ${profile.bio || ''}`);
    if (isVulgar) {
      await updateDoc(doc(db, 'users', profileUid), { profileBlocked: true });
      showToast('⚠️ Profile automatically hidden from public view.', 'info');
    }
    await addDoc(collection(db, 'reports'), {
      reportedId: profileUid, reportedName: profile.name || 'User', type: 'profile', reason,
      reportedBy: user?.uid || 'guest', reporterName: userData?.name || 'Someone',
      status: 'pending', createdAt: new Date().toISOString(), autoBlocked: isVulgar,
    });
    showToast(t('report_submitted', '✅ Profile report submitted.'), 'success');
    if (isVulgar) {
      profile.profileBlocked = true;
      render();
    }
  });
}

function init() {
  // Clear any cached module-level profile page state to ensure a fresh fetch and clean rendering
  profile = null;
  stories = [];
  bookmarkedStories = [];
  ledgerTransactions = [];
  activeTab = 'stories';
  isEditing = false;
  formState = {};
  loadedUid = null;

  initBugReport();
  const onGoldDonated = (e) => {
    if (!isProfileMounted()) return;
    const { storyId, amount, authorId, toUid } = e.detail || {};
    stories = stories.map(s => s.id === storyId ? { ...s, totalGold: (s.totalGold || 0) + amount, goldReceived: (s.goldReceived || 0) + amount } : s);
    const profileUid = getProfileUid();
    const recipientId = authorId || toUid;
    if (profile && recipientId && profileUid === recipientId) {
      profile.goldReceived = (profile.goldReceived || 0) + amount;
    }
    render();
  };
  window.addEventListener('gold-donated', onGoldDonated);
  registerPageCleanup(() => window.removeEventListener('gold-donated', onGoldDonated));

  const tryLoad = () => {
    if (detectCurrentPageKey() !== 'profile') return;
    const { user, authLoading } = getState();
    if (authLoading) return;
    if (!user) { navigateTo('welcome'); return; }
    const uid = getProfileUid();
    if (!uid) { navigateTo('feed'); return; }
    if (loadedUid === uid && profile) { render(); return; }
    loadedUid = uid;
    loadProfile();
  };

  registerPageSubscription(subscribe('authLoading', tryLoad));
  registerPageSubscription(subscribe('user', tryLoad));

  // 🔥 FIX: Update profile in real‑time when userData changes
  registerPageSubscription(subscribe('userData', (state) => {
    if (!isProfileMounted() || !profile) return;
    if (!state.userData) return;
    const { user } = getState();
    // Only merge and update if the mounted profile is the logged-in user's own profile!
    if (profile.uid !== user?.uid) return;
    // Merge new data into profile
    profile = { ...profile, ...state.userData };
    // Also update formState so the edit form reflects the latest values
    formState = {
      ...formState,
      username: profile.name || '',
      avatar: profile.avatar || '👤',
      border: profile.border || 'default',
      language: profile.language || 'en',
      isPublic: profile.isPublic !== false,
    };
    // Re‑render to update the achievements and stats
    render();
  }));

  registerPageSubscription(subscribe('language', () => {
    if (!isProfileMounted() || !profile) return;
    render();
  }));
  tryLoad();
}

guardAuth(init, 'profile');