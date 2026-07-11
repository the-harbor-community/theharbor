/**
 * Profile page — view/edit, follow, privacy
 */
import { subscribe, getState, t, showToast, showConfirm, navigateTo, getQueryParam } from '../store.js';
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
  return getQueryParam('uid') || getQueryParam('id') || user?.uid;
}
let profile = null;
let stories = [];
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
  if (!root || !profile) return;

  const { user, userData } = getState();
  const profileUid = getProfileUid();
  const isOwn = user?.uid === profileUid;
  const isFollowing = userData?.following?.includes(profileUid);
  const isPrivateAndNotOwn = profile.isPublic === false && !isOwn;

  const goldEarned = stories.reduce((sum, s) => sum + (s.totalGold || s.goldReceived || 0), 0);
  const goldBalance = profile.goldBalance || 0;

  if (profile.profileBlocked && !userData?.isAdmin && !isOwn) {
    root.innerHTML = `<div class="card page-error"><span style="font-size:2rem">⚠️</span><h1>Profile Under Review</h1>
      <p style="font-weight:normal;font-size:var(--text-xs)">This profile is being held for manual administrative review.</p>
      <button class="btn btn--primary" id="back-feed">Back to feed</button></div>`;
    el('back-feed').addEventListener('click', () => navigateTo('feed'));
    return;
  }

  if (isPrivateAndNotOwn) {
    const bCls = borderClass(profile.border || 'default');
    const lockMessage = user
      ? '🔒 This profile is private. Follow to view content.'
      : '🔒 This profile is private.';
    const showFollow = user && !isOwn;

    root.innerHTML = `
      <section class="card profile-header animate-page-enter">
        <div class="profile-avatar ${bCls}">${profile.avatar || '👤'}${profile.isAdmin ? '<span class="profile-admin-badge">👑 ADMIN</span>' : ''}</div>
        <h1 class="profile-name">${profile.name}${profile.emailVerified ? '<span class="profile-verified">✓</span>' : ''}</h1>
        ${profile.bio ? `<p class="profile-meta">${esc(profile.bio)}</p>` : ''}
        <p style="font-size:var(--text-sm);color:var(--text-muted);margin:0.5rem 0 1rem">${lockMessage}</p>
        ${showFollow ? `<div class="profile-actions"><button class="btn ${isFollowing ? 'btn--secondary' : 'btn--primary'}" id="follow-btn">${isFollowing ? '✓ Following' : '➕ Follow'}</button></div>` : ''}
        ${user ? `<div class="profile-actions" style="margin-top:0.5rem"><button class="btn btn--danger" id="report-profile">⚠️ Report Profile</button></div>` : ''}
      </section>
      ${renderAchievementsSection(true)}
      <div id="users-modal" class="modal-overlay" hidden role="dialog" aria-modal="true">
        <div class="modal-panel"><button class="modal-close" id="users-close">✕</button>
          <h2 id="users-modal-title" style="font-size:var(--text-sm);font-weight:900;margin:0 0 1rem"></h2>
          <div id="users-list" style="max-height:15rem;overflow-y:auto"></div></div></div>`;

    el('follow-btn')?.addEventListener('click', () => followUser(getProfileUid()));
    el('report-profile')?.addEventListener('click', handleReportProfile);
    el('users-close')?.addEventListener('click', () => el('users-modal').hidden = true);
    return;
  }

  // PUBLIC PROFILE
  const bCls = borderClass(isOwn ? (userData?.border || profile.border) : profile.border);

  root.innerHTML = `
    <section class="card profile-header animate-page-enter">
      ${isOwn ? `<button class="profile-privacy-btn" id="toggle-privacy">${profile.isPublic !== false ? '🔓 Public' : '🔒 Private'}</button>` : ''}
      <div class="profile-avatar ${bCls}">${profile.avatar || '👤'}${profile.isAdmin ? '<span class="profile-admin-badge">👑 ADMIN</span>' : ''}</div>
      <h1 class="profile-name">${profile.name}${profile.emailVerified ? '<span class="profile-verified">✓</span>' : ''}</h1>
      <p class="profile-meta">📍 ${profile.country || 'International'} • 🏷 ${profile.gender || 'Prefer not to say'}</p>
      <p class="profile-meta">📅 Joined ${profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'Recently'}</p>
      ${profile.status === 'RESTRICTED (Under 13)' ? `
        <div class="profile-warning-badge animate-page-enter" style="
          margin: 1.25rem auto 1.5rem auto;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.05));
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: var(--radius-lg);
          padding: 1rem 1.25rem;
          max-width: 32rem;
          backdrop-filter: blur(8px);
          box-shadow: 0 4px 20px rgba(239, 68, 68, 0.08);
          transition: all 0.3s ease;
        ">
          <span style="font-size: 1.5rem; filter: drop-shadow(0 2px 4px rgba(239, 68, 68, 0.3));">🛡️</span>
          <div style="text-align: left;">
            <div style="font-weight: 800; color: #ef4444; font-size: 0.8125rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.125rem;">
              Account Restricted (Under 13)
            </div>
            <div style="color: var(--text-secondary); font-size: 0.7125rem; font-weight: 500; line-height: 1.3;">
              This account has safety restrictions enabled in compliance with children protection guidelines.
            </div>
          </div>
        </div>
      ` : ''}
      <div class="profile-actions">
        ${isOwn ? `<button class="btn btn--primary" id="edit-toggle">${isEditing ? 'Cancel Edit' : '⚙️ Edit Profile'}</button>
          <button class="btn btn--secondary" id="nav-bookmarks-btn">🔖 Bookmarks</button>` :
          user ? `<button class="btn ${isFollowing ? 'btn--secondary' : 'btn--primary'}" id="follow-btn">${isFollowing ? '✓ Following' : '➕ Follow'}</button>
            <button class="btn btn--danger" id="report-profile">⚠️ Report Profile</button>` : ''}
      </div>
      <div class="profile-stats-grid">
        <div class="profile-stats-row top-metrics">
          <div class="profile-stat profile-stat--clickable" data-list="following">
            <span class="profile-stat-value">${profile.following?.length || 0}</span>
            <span class="profile-stat-label">${t('following', 'Following')}</span>
          </div>
          <div class="profile-stat profile-stat--clickable" data-list="followers">
            <span class="profile-stat-value">${profile.followers?.length || 0}</span>
            <span class="profile-stat-label">${t('followers', 'Followers')}</span>
          </div>
          <div class="profile-stat">
            <span class="profile-stat-value">❤️ ${profile.likesReceived || 0}</span>
            <span class="profile-stat-label">${t('likes', 'Likes')}</span>
          </div>
        </div>
        
        <div class="profile-stats-row below-metrics">
          <div class="profile-stat">
            <span class="profile-stat-value">${profile.storyCount || 0}</span>
            <span class="profile-stat-label">${t('stories', 'Stories')}</span>
          </div>
          <div class="profile-stat">
            <span class="profile-stat-value">🪙 ${goldEarned}</span>
            <span class="profile-stat-label">${t('gold_earned', 'Gold Earned')}</span>
          </div>
          <div class="profile-stat">
            <span class="profile-stat-value">🪙 ${goldBalance}</span>
            <span class="profile-stat-label">${t('current_gold_balance', 'Current Gold Balance')}</span>
          </div>
        </div>
      </div>
    </section>
    ${isOwn && isEditing ? renderEditForm() : ''}
    ${renderAchievementsSection(false)}
    ${`<section><h2 style="font-size:var(--text-sm);font-weight:700;border-bottom:1px solid var(--color-border);padding-bottom:0.5rem;margin-bottom:var(--space-md)">📝 Shared Stories (${stories.length})</h2>
      ${stories.length ? stories.map(s => `<article class="card profile-story-card list-item" data-story="${s.id}">
        <h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>
        <div style="font-size:0.625rem;color:var(--text-muted);margin-top:0.5rem;padding-top:0.5rem;border-top:1px solid var(--color-border)">❤️ ${s.reactions?.['❤️'] || 0} · 💬 ${s.commentCount || 0}</div>
      </article>`).join('') : '<div class="page-empty">No stories shared yet.</div>'}</section>`}
    <div id="gender-modal" class="modal-overlay" hidden role="dialog" aria-modal="true">
      <div class="modal-panel"><button class="modal-close" id="gender-close">✕</button>
        <h2 style="font-size:var(--text-sm);font-weight:900;margin:0 0 0.5rem">⚓ One-Time Gender Correction</h2>
        <p style="font-size:var(--text-xs);color:var(--text-muted);margin:0 0 1rem">You may correct your gender exactly once.</p>
        <select class="select" id="new-gender"><option value="🧔 Man">🧔 Man</option><option value="👩 Woman">👩 Woman</option>
          <option value="⚧️ Non-binary">⚧️ Non-binary</option><option value="🙅 Prefer not to say">🙅 Prefer not to say</option></select>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem">
          <button class="btn btn--secondary" id="gender-cancel">Cancel</button>
          <button class="btn btn--primary" id="gender-apply">Apply Correction</button></div></div></div>
    <div id="users-modal" class="modal-overlay" hidden role="dialog" aria-modal="true">
      <div class="modal-panel"><button class="modal-close" id="users-close">✕</button>
        <h2 id="users-modal-title" style="font-size:var(--text-sm);font-weight:900;margin:0 0 1rem"></h2>
        <div id="users-list" style="max-height:15rem;overflow-y:auto"></div></div></div>`;

  wireEvents(isOwn, false);
}

function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function renderEditForm() {
  const s = formState;
  return `<form class="card animate-page-enter" id="profile-form" style="margin-top:var(--space-md)">
    <h2 style="font-size:var(--text-base);font-weight:700;border-bottom:1px solid var(--color-border);padding-bottom:0.5rem;margin:0 0 1rem">⚙️ Edit Customization Profile</h2>
    <label class="label">Username</label><input class="input" id="pf-name" maxlength="30" value="${esc(s.username)}" required>
    <label class="label" style="margin-top:0.75rem">Birthday</label>
    <input type="date" class="input" id="pf-birthday" value="${esc(s.birthday || '')}" required style="width: 100%; box-sizing: border-box;">
    <label class="label" style="margin-top:0.75rem">Gender</label>
    <div class="input" style="opacity:0.7">${esc(profile.gender || 'Prefer not to say')} (Locked)</div>
    <p style="font-size:0.625rem;color:var(--text-muted)">ℹ️ ${profile.genderCorrected ? 'You have already used your one-time correction.' : '<button type="button" id="gender-open" style="color:var(--color-primary);font-weight:800;background:none;border:none;cursor:pointer;font-family:inherit">Submit a one-time support request</button>'}</p>
    <label class="label" style="margin-top:0.75rem">Select Avatar</label>
    <div class="avatar-grid">${AVATAR_OPTIONS.map(av => `<button type="button" class="avatar-option${s.avatar === av ? ' selected' : ''}" data-avatar="${av}">${av}</button>`).join('')}</div>
    <label class="label" style="margin-top:0.75rem">Select Border</label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">${BORDER_OPTIONS.map(b => `<button type="button" class="btn ${s.border === b.id ? 'btn--primary' : 'btn--secondary'}" data-border="${b.id}">${b.label}</button>`).join('')}</div>
    <label class="label" style="margin-top:0.75rem">Language</label>
    <select class="select" id="pf-lang"><option value="en">🇺🇸 English</option><option value="fr">🇫🇷 Français</option><option value="ru">🇷🇺 Русский</option>
      <option value="ja">🇯🇵 日本語</option><option value="ar">🇸🇦 العربية</option><option value="zh">🇨🇳 中文</option><option value="bn">🇧🇩 বাংলা</option></select>
    <div class="form-row"><div><label style="font-size:var(--text-xs);font-weight:700">Public Visibility</label><span class="form-row__hint">Only approved followers can view private profiles.</span></div>
      <input type="checkbox" id="pf-public" ${s.isPublic ? 'checked' : ''}></div>

    <!-- Sleek Password Edit Section -->
    <div class="card" style="margin-top:1.5rem; margin-bottom:1rem; border:1px dashed var(--color-border); background:var(--bg-secondary); padding:1.25rem; border-radius:var(--radius-lg)">
      <h3 style="font-size:var(--text-sm); font-weight:700; margin:0 0 0.75rem; display:flex; align-items:center; gap:0.5rem">🔒 Change Account Password</h3>
      
      <div id="pw-edit-error" class="error-banner" style="display:none; margin-bottom:0.75rem; padding:0.5rem; font-size:0.75rem; background:rgba(239, 68, 68, 0.1); color:var(--color-danger); border-left:3px solid var(--color-danger);"></div>
      <div id="pw-edit-success" class="success-banner" style="display:none; margin-bottom:0.75rem; padding:0.5rem; font-size:0.75rem; background:rgba(16, 185, 129, 0.1); color:var(--color-success); border-left:3px solid var(--color-success);"></div>
      
      <div class="field" style="margin-bottom:0.75rem">
        <label class="label" style="font-size:0.6875rem">Current (Old) Password</label>
        <input type="password" class="input" id="pw-old" placeholder="Current password" style="background:var(--bg-primary)" autocomplete="current-password">
      </div>

      <div class="field" style="margin-bottom:0.75rem">
        <label class="label" style="font-size:0.6875rem">New Password</label>
        <input type="password" class="input" id="pw-new" placeholder="Min 6 chars" style="background:var(--bg-primary)" autocomplete="new-password" disabled>
        <div id="pw-strength-indicator" style="font-size:0.625rem; font-weight:700; margin-top:0.25rem"></div>
      </div>
      
      <div class="field" style="margin-bottom:0.75rem">
        <label class="label" style="font-size:0.6875rem">Confirm New Password</label>
        <input type="password" class="input" id="pw-confirm" placeholder="Confirm password" style="background:var(--bg-primary)" autocomplete="new-password" disabled>
        <div id="pw-mismatch-indicator" style="font-size:0.625rem; color:var(--color-danger); font-weight:700; margin-top:0.25rem"></div>
      </div>
      
      <button type="button" class="btn btn--primary" id="pw-submit-btn" style="width:100%; margin-top:0.5rem; padding:0.5rem; font-size:0.75rem">
        <span id="pw-btn-text">Update Password</span>
      </button>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem">
      <button type="button" class="btn btn--ghost" style="color:var(--color-danger)" id="delete-account-link">⚠️ Permanent Account Deletion</button>
      <button type="submit" class="btn btn--primary">💾 Save Custom Profile</button></div></form>`;
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
  el('edit-toggle')?.addEventListener('click', (e) => { e.preventDefault(); isEditing = !isEditing; render(); });
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
  if (!profileUid) { el('profile-root').innerHTML = '<div class="page-error">No user selected.</div>'; return; }
  if (!user) return;
  
  let isBackground = false;
  if (profile && (profile.uid === profileUid || (isEditing && profile.uid === user.uid))) {
    isBackground = true;
    render();
  } else {
    el('profile-root').innerHTML = '<div class="page-skeleton"></div>';
  }
  try {
    const docSnap = await getDoc(doc(db, 'users', profileUid));
    if (!docSnap.exists()) { el('profile-root').innerHTML = '<div class="page-error">User not found.</div>'; return; }
    profile = { ...docSnap.data(), emailVerified: docSnap.data().emailVerified || user.emailVerified };
    formState = {
      username: profile.name || '', avatar: profile.avatar || '👤', border: profile.border || 'default',
      language: profile.language || 'en', isPublic: profile.isPublic !== false,
      birthday: profile.birthday || '',
    };
    const isOwn = user.uid === profileUid;
    const isFollowing = getState().userData?.following?.includes(profileUid);
    if (profile.isPublic !== false || isOwn || isFollowing) {
      const sq = query(collection(db, 'stories'), where('userId', '==', profileUid), where('approved', '==', true), orderBy('createdAt', 'desc'));
      const snap = await getDocs(sq);
      stories = [];
      snap.forEach(d => stories.push({ id: d.id, ...d.data() }));
    } else stories = [];
    

    
    // Auto-trigger edit mode if hash is #password
    if (isOwn && window.location.hash === '#password') {
      isEditing = true;
    }
    
    render();
    
    // Smooth scroll to password edit card
    if (isOwn && window.location.hash === '#password') {
      setTimeout(() => {
        el('pw-new')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el('pw-new')?.focus();
      }, 300);
    }
  } catch (err) {
    el('profile-root').innerHTML = `<div class="page-error">${err.message}</div>`;
  }
}

async function handleTogglePrivacy() {
  const profileUid = getProfileUid();
  try {
    const newPrivacy = profile.isPublic === false;
    await updateDoc(doc(db, 'users', profileUid), { isPublic: newPrivacy });
    profile.isPublic = newPrivacy;
    formState.isPublic = newPrivacy;
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
    isPublic: el('pf-public').checked, language: el('pf-lang').value,
    birthday: birthdayVal, status: statusVal,
  };
  try {
    await updateDoc(doc(db, 'users', user.uid), updateData);
    await changeLanguage(updateData.language);
    Object.assign(profile, updateData);
    if (getState().userData) Object.assign(getState().userData, updateData);
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
  el('users-list').innerHTML = list.length ? list.map(u => `
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