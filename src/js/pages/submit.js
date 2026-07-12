/**
 * Submit page — story submission with moderation API
 */
import { getState, t, showToast, showConfirm, navigateTo, subscribe } from '../store.js';
import { bindCategoryPopovers, showCategoryPopover } from '../utils/category-popover.js';
import { db, doc, collection, runTransaction } from '../firebase.js';
import { increment } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { initBugReport } from '../page-common.js';
import { guardAuth } from './shared.js';
import { allowedStoryCategories, pageEl, checkVulgarWords, logFlaggedAttempt, setupRealtimeInputHighlighting } from '../utils.js';
import { detectCurrentPageKey, registerPageSubscription } from '../router.js';

let title = '', content = '', category = 'struggles', isAnonymous = true, visibility = 'public', loading = false;
let unsubscribeUserData = null;

function el(id) { return pageEl(id); }

function isSubmitMounted() {
  return detectCurrentPageKey() === 'submit' && !!pageEl('submit-form');
}

function defaultCategory(userData) {
  if (userData?.gender === '🧔 Man') return 'men';
  if (userData?.gender === '👩 Woman') return 'women';
  return 'struggles';
}

function renderCategoryOptions(userData) {
  const sel = el('category');
  if (!sel) return;
  const opts = allowedStoryCategories(userData?.gender);
  const buffer = document.createElement('div');
  buffer.innerHTML = opts.map(([v, labelKey]) => {
    const labelMap = {
      men: `🧔 ${t('tab_men', "Man")}`,
      women: `👩 ${t('tab_women', 'Woman')}`,
      struggles: `🌊 ${t('tab_storm', 'Storm (Struggles)')}`,
      fun: `☀️ ${t('tab_sunny', 'Sunny (Fun/Encouragement)')}`,
      learning: `🧭 ${t('tab_compass', 'Compass (Lessons)')}`,
    };
    return `<option value="${v}"${v === category ? ' selected' : ''}>${labelMap[v] || labelKey}</option>`;
  }).join('');
  sel.replaceChildren(...buffer.childNodes);
}

function restoreDraft(userData) {
  const draft = localStorage.getItem('story_draft_new');
  if (!draft) return;
  try {
    const d = JSON.parse(draft);
    if (d.title || d.text) {
      title = d.title || '';
      content = d.text || '';
      category = userData?.gender === '🧔 Man' ? 'men' : userData?.gender === '👩 Woman' ? 'women' : (d.category || 'struggles');
      isAnonymous = d.isAnonymous !== false;
      visibility = d.visibility || 'public';
      showToast('✅ Restored your unsaved story draft!', 'success');
    }
  } catch { /* noop */ }
}

function bindForm() {
  if (!isSubmitMounted()) return;
  const titleEl = el('title');
  const contentEl = el('content');
  if (!titleEl || !contentEl) return;
  titleEl.value = title;
  contentEl.value = content;
  
  setupRealtimeInputHighlighting(titleEl);
  setupRealtimeInputHighlighting(contentEl);
  el('anonymous') && (el('anonymous').checked = isAnonymous);
  el('visibility') && (el('visibility').value = visibility);
  el('title-count') && (el('title-count').textContent = `${title.length}/100`);
  el('content-count') && (el('content-count').textContent = `${content.length}/5000`);

  titleEl.addEventListener('input', (e) => { title = e.target.value; const c = el('title-count'); if (c) c.textContent = `${title.length}/100`; scheduleSave(); });
  contentEl.addEventListener('input', (e) => { content = e.target.value; const c = el('content-count'); if (c) c.textContent = `${content.length}/5000`; scheduleSave(); });
  el('category')?.addEventListener('change', (e) => { category = e.target.value; scheduleSave(); });
  
  const categorySel = el('category');
  if (categorySel) {
    bindCategoryPopovers([categorySel], (s) => s.value);
    categorySel.addEventListener('change', () => {
      showCategoryPopover(categorySel, categorySel.value);
    });
  }

  el('anonymous')?.addEventListener('change', (e) => { isAnonymous = e.target.checked; scheduleSave(); });
  el('visibility')?.addEventListener('change', (e) => { visibility = e.target.value; scheduleSave(); });
  el('submit-form')?.addEventListener('submit', handleSubmit);
}

let saveTimer;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem('story_draft_new', JSON.stringify({ title, text: content, category, isAnonymous, visibility, timestamp: Date.now() }));
  }, 1500);
}

function handleSubmit(e) {
  e.preventDefault();
  const { userData } = getState();
  el('form-error').hidden = true;
  const titleTrim = title.trim();
  const contentTrim = content.trim();
  if (!titleTrim || !contentTrim) { showFormError(t('title_content_required', 'Title and content are required.')); return; }
  if (titleTrim.length < 3 || titleTrim.length > 100) { showFormError(t('title_min_chars', 'Title must be between 3 and 100 characters.')); return; }
  if (contentTrim.length < 10 || contentTrim.length > 5000) { showFormError(t('story_min_chars', 'Story must be between 10 and 5000 characters.')); return; }
  if (category === 'men' && userData.gender !== '🧔 Man') { showFormError(t('mens_harbor_only', "Men's Harbor is restricted to men only.")); return; }
  if (category === 'women' && userData.gender !== '👩 Woman') { showFormError(t('womens_harbor_only', "Women's Harbor is restricted to women only.")); return; }

  if (checkVulgarWords(titleTrim) || checkVulgarWords(contentTrim)) {
    const errorMsg = 'Inappropriate content detected. Submission blocked to keep The Harbor safe.';
    const errEl = el('form-error');
    if (errEl) {
      const buffer = document.createElement('div');
      buffer.innerHTML = `
        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--color-danger); border-radius: 0.5rem; padding: 1rem; color: var(--color-danger); font-size: 0.8125rem; line-height: 1.5; text-align: left;">
          <strong style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem">⚠️ Security Blocked Trigger</strong>
          Your story submission contains language that violates our community guidelines. This attempt has been logged under your account for manual moderation review. Please revise your content.
        </div>
      `;
      errEl.replaceChildren(...buffer.childNodes);
      errEl.hidden = false;
    } else {
      showFormError(errorMsg);
    }
    showToast(`⚠️ ${errorMsg}`, 'error');
    logFlaggedAttempt({ title: titleTrim, text: contentTrim }, 'story');
    return;
  }

  showConfirm(t('submit_story', 'Submit Story?'), t('submit_story_confirm', 'Are you sure you want to publish this story to the community?'), false, () => submitStory(titleTrim, contentTrim));
}

function showFormError(msg) {
  const errEl = el('form-error');
  if (!errEl) return;
  errEl.textContent = `⚠️ ${msg}`;
  errEl.hidden = false;
}

async function submitStory(titleTrim, contentTrim) {
  const { user, userData } = getState();
  loading = true;
  const submitBtn = el('submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = t('loading', 'Publishing...');
  }
  try {
    let approved = true;
    const modRes = await fetch('./api/gemini/moderate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: contentTrim }) });
    if (modRes.ok) {
      const modData = await modRes.json();
      if (modData.flagged) { approved = false; showToast('⚠️ Your story was held for manual admin review due to safety triggers.', 'warning'); }
    }
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const userRef = doc(db, 'users', user.uid);
      const storyRef = doc(collection(db, 'stories'));
      transaction.set(storyRef, {
        title: titleTrim, text: contentTrim, category, authorId: user.uid, userId: user.uid,
        authorName: isAnonymous ? 'Anonymous' : userData.name, isAnonymous, visibility, approved, createdAt: now,
        reactions: { '❤️': 0, '🙏': 0, '😢': 0, '💪': 0, '🤗': 0 }, commentCount: 0, goldReceived: 0, totalGold: 0, version: 0, editCount: 0,
      });
      if (approved) transaction.update(userRef, { storyCount: increment(1) });
    });
    localStorage.removeItem('story_draft_new');
    showToast(approved ? '🎉 Story published successfully!' : '⏳ Held for review', 'success');
    navigateTo('feed');
  } catch (err) {
    showFormError(err.message || 'Failed to submit story.');
  } finally {
    loading = false;
    const submitBtn = el('submit-btn');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = `🚀 ${t('send_story', 'Publish Story')}`;
    }
  }
}

function checkBannedState() {
  const { userData } = getState();
  if (userData?.isBanned) {
    const form = document.getElementById('submit-form');
    if (form) {
      const buffer = document.createElement('div');
      buffer.innerHTML = `
        <div style="background: rgba(239, 68, 68, 0.1); border: 2px solid var(--color-danger); padding: 1.5rem; border-radius: var(--radius-lg); text-align: center; color: var(--text-primary);">
          <div style="font-size: 3rem; margin-bottom: 0.75rem;">⚠️</div>
          <h2 style="font-weight: 800; font-size: 1.25rem; color: var(--color-danger); margin-bottom: 0.5rem;">Account Restricted</h2>
          <p style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5; max-width: 24rem; margin: 0 auto;">
            Your account has been restricted from creating new stories at this time. Banned users are permitted to browse and read existing stories, but cannot engage or post content.
          </p>
        </div>
      `;
      form.replaceChildren(...buffer.childNodes);
    }
    return true;
  }
  return false;
}

function init() {
  if (!isSubmitMounted()) return;
  initBugReport();
  const { userData } = getState();
  
  // Instant render of default options to prevent layout shift/flickering
  category = defaultCategory(userData);
  renderCategoryOptions(userData);
  restoreDraft(userData);
  bindForm();

  if (!userData) {
    // Wait for userData to become available
    if (unsubscribeUserData) unsubscribeUserData();
    unsubscribeUserData = subscribe('userData', (state) => {
      if (state.userData && isSubmitMounted()) {
        const uData = state.userData;
        if (uData.isBanned) {
          checkBannedState();
          return;
        }
        category = defaultCategory(uData);
        renderCategoryOptions(uData);
        restoreDraft(uData);
        bindForm();
        if (unsubscribeUserData) {
          unsubscribeUserData();
          unsubscribeUserData = null;
        }
      }
    });
    registerPageSubscription(unsubscribeUserData);
  } else if (userData.isBanned) {
    checkBannedState();
  }
}

guardAuth(init, 'submit');