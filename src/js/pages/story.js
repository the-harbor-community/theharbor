/**
 * Story page — full view with comments, translate, reactions
 */
import { subscribe, getState, t, showToast, showConfirm, navigateTo, getQueryParam } from '../store.js';
import { db, resolveAuthorId, increment, recordStoryView } from '../firebase.js';
import {
  doc, getDoc, collection, getDocs, query, where, orderBy, updateDoc, runTransaction,
  deleteDoc, writeBatch,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { translateText } from '../translate.js';
import { moderateContent, triggerFloatingEmoji, REACTION_EMOJIS, formatTimeAgo, checkVulgarWords, logFlaggedAttempt, highlightVulgarWords, setupRealtimeInputHighlighting } from '../utils.js';
import { initBugReport } from '../page-common.js';
import { guardAuth } from './shared.js';
import { detectCurrentPageKey, registerPageCleanup } from '../router.js';
import { applyLovePointsInTransaction, isLoveReaction } from '../love-points.js';
import { playLoveDrop, playToneForEvent } from '../audio.js';

const REACTION_EMOJIS_LIST = REACTION_EMOJIS;
let story = null;
let comments = [];
let userReactions = [];
let commentReactions = {};
let userCommentReactions = {};
let translatedTitle = '';
let translatedText = '';
let isTranslated = false;
let activeReplyParentId = null;
let highlightedCommentId = null;
let currentStoryId = null;

function el(id) { return document.getElementById(id); }

function renderLoading() {
  const root = el('story-root');
  if (root) root.innerHTML = '<div class="page-skeleton"></div><div class="page-skeleton"></div>';
}

function renderError(msg) {
  const root = el('story-root');
  if (root) {
    root.innerHTML = `
      <div class="page-error">⚠️ ${msg}
        <button class="btn btn--primary" style="margin-top:1rem" id="back-feed">${t('back_home', '← Back to Home')}</button>
      </div>`;
    el('back-feed')?.addEventListener('click', (e) => { e.preventDefault(); handleBackToFeed(); });
  }
}

function handleBackToFeed(e) {
  e?.preventDefault();
  navigateTo('feed');
}

function avatarHtml(userId, authorName, isAnonymous, sizeClass = 'story-avatar') {
  if (isAnonymous) {
    return `<div class="${sizeClass} ${sizeClass}--anon" aria-hidden="true">?</div>`;
  }
  const initial = (authorName || 'A')[0].toUpperCase();
  return `<button type="button" class="${sizeClass} ${sizeClass}--clickable" data-profile-uid="${userId || ''}" aria-label="${t('view_profile', 'View profile')}">${initial}</button>`;
}

function getMainComments() {
  return comments.filter(c => !c.parentId);
}

function getRepliesMap() {
  const map = {};
  comments.forEach(c => {
    if (c.parentId) {
      if (!map[c.parentId]) map[c.parentId] = [];
      map[c.parentId].push(c);
    }
  });
  return map;
}

function renderCommentReactions(commentId, reactions, showGold, commentUserId) {
  const userRx = userCommentReactions[commentId] || [];
  const { user } = getState();
  const authorId = commentUserId || '';
  const rxHtml = REACTION_EMOJIS_LIST.map(emoji => {
    const count = reactions?.[emoji] || 0;
    const active = userRx.includes(emoji) ? ' active' : '';
    const loveCls = (emoji === '❤️' || emoji === '🥰' || emoji === '💕') ? ' reaction-love' : '';
    return `<button type="button" class="story-reaction comment-react${loveCls}${active}" data-comment="${commentId}" data-emoji="${emoji}">${emoji} ${count}</button>`;
  }).join('');
  const goldBtn = showGold && user && authorId !== user.uid
    ? `<button type="button" class="story-btn story-btn--gold donate-btn comment-gold-btn" data-gold-story="${story?.id || ''}" data-action="gold" aria-label="${t('donate_gold', 'Donate Gold')}">🪙 ${t('donate_gold', 'Donate Gold')}</button>`
    : '';
  return `<div class="comment-reactions">${rxHtml}${goldBtn}</div>`;
}

function renderComments(isOwner) {
  const main = getMainComments().sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });
  const repliesMap = getRepliesMap();
  const { user } = getState();

  if (!main.length) {
    return `<div class="page-empty">${t('no_comments_yet', 'No comments yet. Be the first to share support!')}</div>`;
  }

  return main.map(comment => {
    const hl = highlightedCommentId === comment.id ? ' comment-card--highlight comment-card--highlight-flash' : '';
    const pinned = comment.isPinned ? ' comment-card--pinned' : '';
    const replies = (repliesMap[comment.id] || []).map(reply => `
      <div class="comment-reply${highlightedCommentId === reply.id ? ' comment-card--highlight comment-card--highlight-flash' : ''}" id="comment-${reply.id}">
        <div class="comment-header">
          ${avatarHtml(resolveAuthorId(reply), reply.authorName, reply.isAnonymous, 'comment-avatar')}
          <span class="comment-author">${reply.isAnonymous ? `🕊️ ${t('anonymous', 'Anonymous')}` : reply.authorName}</span>
          <span class="story-date">${formatTimeAgo(reply.createdAt)}</span>
          ${(user && (reply.userId === user.uid || isOwner)) ? `
            <button type="button" class="story-btn story-btn--danger" style="font-size:0.625rem;padding:0.125rem 0.5rem;margin-left:0.25rem;" data-delete-reply="${reply.id}">🗑️</button>
          ` : ''}
        </div>
        <p class="comment-text">${escapeText(reply.text)}</p>
        ${renderCommentReactions(reply.id, reply.reactions || commentReactions[reply.id], true, resolveAuthorId(reply) || reply.userId)}
      </div>`).join('');

    const replyForm = activeReplyParentId === comment.id ? `
      <div class="comment-reply-form">
        <textarea class="textarea reply-text" rows="2" maxlength="500" placeholder="${t('reply_placeholder', 'Write a supportive reply...')}"></textarea>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:0.5rem;flex-wrap:wrap;gap:0.5rem;">
          <label style="font-size:0.625rem;font-weight:700;display:flex;align-items:center;gap:0.25rem;cursor:pointer;">
            <input type="checkbox" class="reply-anon"> ${t('anonymous', 'Anonymous')}
          </label>
          <div style="display:flex;gap:0.5rem;">
            <button class="btn btn--secondary cancel-reply" type="button">${t('cancel', 'Cancel')}</button>
            <button class="btn btn--primary submit-reply" data-parent="${comment.id}" type="button">${t('reply', 'Reply')}</button>
          </div>
        </div>
      </div>` : '';

    // 🔥 Delete button for comments: visible to comment author OR story owner
    const showDelete = user && (comment.userId === user.uid || isOwner);

    // 🔥 Pin button for comments: visible to story owner
    const pinBtn = isOwner ? `
      <button type="button" class="story-btn story-btn--primary" style="font-size:0.625rem;padding:0.125rem 0.5rem" data-pin="${comment.id}" data-pinned="${comment.isPinned ? 'true' : 'false'}">
        📌 ${comment.isPinned ? t('unpin', 'Unpin') : t('pin', 'Pin')}
      </button>` : '';

    return `
      <div class="comment-card${pinned}${hl}" id="comment-${comment.id}">
        ${comment.isPinned ? `<span class="comment-pin-badge">📌 ${t('pinned_by_author', 'PINNED BY AUTHOR')}</span>` : ''}
        <div class="comment-header">
          ${avatarHtml(resolveAuthorId(comment), comment.authorName, comment.isAnonymous, 'comment-avatar')}
          <span class="comment-author">${comment.isAnonymous ? `🕊️ ${t('anonymous', 'Anonymous')}` : comment.authorName}</span>
          <div style="display:flex;gap:0.5rem;align-items:center;margin-left:auto;flex-wrap:wrap;">
            <span class="story-date">${formatTimeAgo(comment.createdAt)}</span>
            ${pinBtn}
            ${user && comment.userId !== user.uid ? `<button type="button" class="story-btn story-btn--danger" style="font-size:0.625rem;padding:0.125rem 0.5rem" data-report-comment="${comment.id}">⚠️ ${t('report', 'Flag')}</button>` : ''}
            ${showDelete ? `<button type="button" class="story-btn story-btn--danger" style="font-size:0.625rem;padding:0.125rem 0.5rem" data-delete-comment="${comment.id}">🗑️ ${t('delete', 'Delete')}</button>` : ''}
          </div>
        </div>
        <p class="comment-text">${escapeText(comment.text)}</p>
        ${renderCommentReactions(comment.id, comment.reactions || commentReactions[comment.id], true, resolveAuthorId(comment) || comment.userId)}
        ${(user && !getState().userData?.isBanned) ? `<button type="button" class="story-btn" style="font-size:0.625rem;border:none;background:none;padding:0" data-reply="${comment.id}">💬 ${t('reply', 'Reply')}</button>` : ''}
        ${replyForm}
        ${replies ? `<div class="comment-replies">${replies}</div>` : ''}
      </div>`;
  }).join('');
}

function escapeText(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return highlightVulgarWords(d.innerHTML);
}

function renderStory() {
  if (!story || !el('story-root')) return;
  const { user, userData } = getState();
  const isOwner = user && resolveAuthorId(story) === user.uid;
  const canEdit = isOwner;
  const gold = story.totalGold || story.goldReceived || 0;

  const reactionsHtml = REACTION_EMOJIS_LIST.map(emoji => {
    const count = story.reactions?.[emoji] || 0;
    const active = userReactions.includes(emoji) ? ' active' : '';
    const loveCls = (emoji === '❤️' || emoji === '🥰' || emoji === '💕') ? ' reaction-love' : '';
    return `<button type="button" class="story-reaction${loveCls}${active}" data-emoji="${emoji}">${emoji} ${count}</button>`;
  }).join('');

  el('story-root').innerHTML = `
    <button type="button" class="page-back" id="back-btn">${t('back_to_feed', '← Back to feed')}</button>
    <article class="card story-article animate-page-enter">
      <div class="story-meta">
        <div class="story-author">
          ${avatarHtml(resolveAuthorId(story), story.authorName, story.isAnonymous)}
          <div>
            <span class="story-author-name${story.isAnonymous ? ' story-author-name--anon' : ''}">${story.isAnonymous ? `🕊️ ${t('anonymous', 'Anonymous')}` : story.authorName}</span>
            <span class="story-date">${formatTimeAgo(story.createdAt)}</span>
          </div>
        </div>
        <div class="story-badges">
          <span class="story-views-badge" style="font-size: 0.6875rem; color: var(--text-muted); display: inline-flex; align-items: center; gap: 0.25rem;">👁️ ${story.views || 0} views</span>
          <span class="story-category">${story.category || ''}</span>
          ${gold > 0 ? `<span class="story-gold-badge">🪙 ${gold}</span>` : ''}
        </div>
      </div>
      <h1 class="story-title">${escapeText(isTranslated ? translatedTitle : story.title)}</h1>
      <p class="story-text">${escapeText(isTranslated ? translatedText : story.text)}</p>
      ${story.version > 0 ? `<div class="story-edited">✏️ ${t('edited_label', 'Edited')} ${story.version} ${story.version === 1 ? t('time', 'time') : t('times', 'times')}.</div>` : ''}
      <div class="story-reactions">${reactionsHtml}</div>
      <div class="story-actions">
        <div class="story-actions__group">
          <button type="button" class="story-btn" id="btn-translate">${isTranslated ? `🌐 ${t('original', 'Original')}` : `🌐 ${t('translate', 'Translate')}`}</button>
          ${!isOwner && user ? `<button type="button" class="story-btn story-btn--gold donate-btn" id="btn-gold" data-action="gold">🪙 ${t('donate_gold', 'Donate Gold')}</button>` : ''}
        </div>
        <div class="story-actions__group">
          ${canEdit ? `<button type="button" class="story-btn story-btn--primary" id="btn-edit">✏️ ${t('edit', 'Edit')}</button><button type="button" class="story-btn story-btn--danger" id="btn-delete">🗑️ ${t('delete', 'Delete')}</button>` : ''}
          <button type="button" class="story-btn" id="btn-share">🔗 ${t('share', 'Share')}</button>
          ${user && !isOwner ? `<button type="button" class="story-btn story-btn--danger" id="btn-flag">⚠️ ${t('report', 'Flag')}</button>` : ''}
        </div>
      </div>
    </article>

    <!-- AI Reflection block -->
    <div id="ai-reflection-container" class="card animate-fade-in" style="background: linear-gradient(135deg, rgba(2, 132, 199, 0.05), rgba(16, 185, 129, 0.05)); border: 1px dashed rgba(2, 132, 199, 0.3); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem; border-radius: var(--radius-xl);">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
        <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-primary); display: flex; align-items: center; gap: 0.375rem; font-family: var(--font-sans);">
          ✨ Harbor AI Companion: Reflection
        </span>
        <button id="btn-ai-reflect" class="btn btn--secondary btn--sm" style="font-size:0.6875rem; padding:0.25rem 0.75rem; border-radius:var(--radius-full); cursor:pointer; font-weight:700;">
          Generate Reflection
        </button>
      </div>
      <p id="ai-reflection-text" style="font-size: var(--text-xs); color: var(--text-secondary); margin: 0; line-height: 1.5; font-style: italic;">
        Click the button to generate a warm, empathetic AI reflection of this story, helping you find healing insights or frame your thoughts.
      </p>
    </div>

    ${user ? (getState().userData?.isBanned ? `
      <div class="card" style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--color-danger); padding: 1.25rem; border-radius: var(--radius-lg); text-align: center; color: var(--text-primary); margin-top: 1rem;">
        <span style="font-size: 2rem; display: block; margin-bottom: 0.5rem;">⚠️</span>
        <div style="font-weight: 700; font-size: 0.875rem; color: var(--color-danger);">Comment Section Restricted</div>
        <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem; line-height: 1.4; max-width: 24rem; margin-left: auto; margin-right: auto;">
          Your account has been restricted from posting comments at this time. Banned users are permitted to browse and read existing stories, but cannot engage or post replies.
        </p>
      </div>
    ` : `
      <form class="card comment-form" id="comment-form">
        <h3 style="font-size:var(--text-sm);font-weight:700;margin:0 0 0.75rem">💬 ${t('leave_comment', 'Leave a supportive comment')}</h3>
        <textarea class="textarea" id="new-comment" rows="3" maxlength="1000" placeholder="${t('comment_kind_placeholder', 'Say something kind or helpful...')}"></textarea>
        <div id="comment-warning" style="margin-bottom: 0.75rem" hidden></div>
        <div class="form-row" style="border:none;padding:0.5rem 0">
          <label style="font-size:0.625rem;font-weight:700;display:flex;align-items:center;gap:0.25rem;cursor:pointer">
            <input type="checkbox" id="comment-anon"> ${t('anonymous', 'Anonymous')}
          </label>
          <span class="char-count" id="comment-count">0/1000</span>
        </div>
        <button type="submit" class="btn btn--primary" style="width:100%">🚀 ${t('post_comment', 'Post Comment')}</button>
      </form>`) : `
      <div class="card page-empty" style="padding:1rem">🔒 ${t('sign_in_to_comment', 'Please sign in to participate in the conversation.')}</div>`}
    <section style="margin-top:var(--space-lg)">
      <h3 style="font-size:var(--text-sm);font-weight:700;border-bottom:1px solid var(--color-border);padding-bottom:0.5rem;margin-bottom:var(--space-md)">🗣️ ${t('discussion', 'Discussion')} (${comments.length})</h3>
      <div id="comments-list">${renderComments(isOwner)}</div>
    </section>`;

  wireEvents(isOwner);
}

function wireProfileAvatars() {
  document.querySelectorAll('[data-profile-uid]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const uid = btn.dataset.profileUid;
      if (uid) navigateTo('profile', { uid });
    });
  });
}

async function generateAiReflection() {
  const btn = el('btn-ai-reflect');
  const textEl = el('ai-reflection-text');
  if (!btn || !textEl || !story) return;
  
  btn.disabled = true;
  btn.textContent = 'Reflecting...';
  textEl.innerHTML = '<div class="feed-skeleton" style="height:2rem; margin-top:0.25rem;"></div>';
  
  let success = false;
  let summary = '';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch('./api/gemini/reflect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: story.text
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && data.reflection) {
        summary = data.reflection.trim();
        success = true;
      }
    }
  } catch (err) {
    console.warn('Server Gemini reflection request failed, moving to local narrative matrix metadata fallback:', err);
  }

  if (!success) {
    const textLower = (story.text || '').toLowerCase();
    const category = (story.category || '').toLowerCase();

    const matrices = {
      grief: {
        openers: [
          "Your heart is carrying such a heavy load right now, and it is completely natural to feel overwhelmed.",
          "Losing someone or something so precious creates a space that words can rarely fill.",
          "There is a deep, quiet courage in speaking your sorrow out loud, even in this space.",
          "The pain you are sharing here is a beautiful testament to how deeply you loved and cared.",
          "Grief is a slow, winding journey, and I want to acknowledge the tenderness of your heart today.",
          "Please allow yourself to feel whatever you need to; sorrow has its own timing."
        ],
        validations: [
          "It is completely okay if the waves of grief feel unpredictable and disorienting.",
          "You do not need to be strong right now; simply breathing through this moment is enough.",
          "Your sorrow is not a problem to be solved, but an experience that deserves gentle witness.",
          "Your feelings of emptiness and longing are valid responses to a profound change.",
          "The world around you might be moving fast, but your journey is allowed to take all the time it needs.",
          "There is no 'right' way to grieve, only your own sacred rhythm of healing."
        ],
        insights: [
          "Perhaps grief is the form love takes when it has nowhere else to go right now.",
          "In time, the sharpness of the pain can slowly soften into a gentle, treasured remembrance.",
          "Your capacity to feel this deeply shows the beautiful capacity of your soul.",
          "Even in the quietest, darkest hours, you are connected to the collective warmth of this community.",
          "Healing doesn't mean forgetting, but rather finding a way to carry their light forward with you.",
          "The memories you hold are safe, and they will wait for you whenever you are ready to visit them."
        ],
        steps: [
          "What is one tiny, gentle thing you can do to comfort yourself or rest your body today?",
          "Can you write down one favorite memory or quality about what you lost to keep close to your chest?",
          "How can you extend a bit of the same compassion you'd give a grieving friend to yourself?",
          "Would you be open to sitting quietly with your feelings, letting them pass like clouds?",
          "Is there a small ritual or quiet place where you feel most connected and at peace?",
          "What does comfort look like for you in this very moment, even if it is just a warm cup of tea?"
        ],
        closers: [
          "We are holding space for your heavy heart tonight.",
          "You are not walking this path alone; we are right here beside you.",
          "Be incredibly gentle with yourself as you navigate these quiet waters.",
          "May you find a small pocket of peace and stillness in your day today.",
          "Sending you endless warmth, comfort, and soft support.",
          "Your courage in sharing this helps heal us all. Rest well."
        ]
      },
      relationships: {
        openers: [
          "Matters of the heart can be incredibly complex, and I hear the vulnerability in your story.",
          "Navigating connections with those we care about often brings both beauty and deep struggle.",
          "It takes immense bravery to speak honestly about the pain of disconnected relationships.",
          "Your desire for genuine connection and understanding is a beautiful, essential part of who you are.",
          "Relationships are mirrors of our deepest selves, and right now, the mirror is showing some heavy truths.",
          "I can feel how much you care about this, and how much the current state is weighting on you."
        ],
        validations: [
          "It is completely valid to feel torn between holding on and protecting your own peace.",
          "You deserve to be heard, valued, and met with the same kindness you offer others.",
          "Feeling hurt or lonely in a connection is a painful experience, and your feelings are so real.",
          "Setting boundaries or acknowledging distance is a necessary, albeit difficult, form of self-love.",
          "Your voice and your emotional needs matter immensely in every dynamic.",
          "It is okay to grieve the way things used to be, or the expectations that weren't met."
        ],
        insights: [
          "Sometimes, the friction we experience is a call to return home to ourselves and our own needs.",
          "No connection is perfect, but you deserve dynamics that nourish rather than deplete your spirit.",
          "Your value is not determined by how others treat you or their capacity to understand you.",
          "Clarity often comes when we step back slightly to view the situation with compassionate objectivity.",
          "Every interaction can teach us more about our boundaries, our desires, and our capacity for growth.",
          "You are capable of defining what healthy, supportive connection looks like for your life."
        ],
        steps: [
          "What does a healthy boundary look like in this situation, and how can you gently voice it?",
          "How can you show yourself the precise appreciation and love you've been hoping to receive from them?",
          "What is one small thing you can do today that is purely for your own joy and independence?",
          "Would it help to write a letter expressing everything you feel, even if you never send it?",
          "Can you identify one core quality you absolutely need in your close connections moving forward?",
          "How can you practice self-compassion as you navigate this relational space?"
        ],
        closers: [
          "You deserve to be surrounded by people who cherish and respect your beautiful light.",
          "We are standing with you in your journey toward healthier, happier connections.",
          "May you find the clarity and peace your heart is searching for.",
          "Remember that your worth is absolute, regardless of anyone else's actions.",
          "Wishing you strength, clarity, and deep comfort in your relations.",
          "You are a valued part of this harbor, and your heart is safe here."
        ]
      },
      career: {
        openers: [
          "Navigating career paths, purpose, and external pressures can feel like an uphill battle.",
          "I hear the stress and exhaustion in your words, and I want to honor your hard work.",
          "It is incredibly difficult when our professional efforts or academic path feel misaligned or unappreciated.",
          "The search for purpose and stable footing in this world is a profound and taxing journey.",
          "Burnout and uncertainty are heavy companions, but speaking them aloud is the first step to relief.",
          "I can feel your determination, even under the weight of current challenges and doubts."
        ],
        validations: [
          "It is completely okay to feel tired, uncertain, or to want a completely different direction.",
          "Your worth as a human being is never tied to your productivity, status, or career success.",
          "Feeling overwhelmed by demands and expectations is a natural sign that you need restorative space.",
          "It is valid to feel discouraged when your efforts don't immediately lead to the outcomes you hoped for.",
          "Your frustration with systemic pressures or workspace dynamics is fully justified.",
          "It is okay to not have all the answers mapped out; you are allowed to figure things out step by step."
        ],
        insights: [
          "Sometimes, a pause or a perceived setback is a gentle invitation to realign with your true passions.",
          "Success is not a linear race, but a highly individual exploration of what makes you feel alive.",
          "Your skills, intelligence, and inner value exist independently of any job description.",
          "Protecting your energy and mental health is the most productive thing you can do for your future.",
          "A single job or exam does not define your destiny; you are much larger than your current role.",
          "Your persistence is admirable, but you also deserve environments that foster your growth safely."
        ],
        steps: [
          "What is one tiny, non-work activity that brings you a sense of play or creative freedom today?",
          "Can you identify one small boundary you can set today to reclaim some of your personal time?",
          "How can you redefine what a successful, fulfilling day looks like on your own terms?",
          "Who is someone you trust that you can talk to about these professional weights or pressures?",
          "What is one professional skill or personal trait of yours that you are genuinely proud of?",
          "If you could change one minor aspect of your daily routine to reduce stress, what would it be?"
        ],
        closers: [
          "We are rooting for your happiness, peace of mind, and true fulfillment.",
          "Remember to treat yourself with the same kindness you'd offer a hardworking friend.",
          "May you find a moment of deep, well-deserved rest and clarity today.",
          "Your journey is uniquely yours, and you are doing much better than you realize.",
          "Wishing you calm waters and bright paths ahead in your professional life.",
          "You are worthy of a balanced, peaceful life. Take it one breath at a time."
        ]
      },
      anxiety: {
        openers: [
          "Anxiety can feel like a storm inside your chest, but I am here to help anchor you.",
          "I hear the racing thoughts and the weight of worry in your words, and I want to help you slow down.",
          "It is incredibly exhausting when fear or overwhelm takes the steering wheel of your mind.",
          "Your story highlights how heavy the feeling of dread or panic can be, and I am listening.",
          "In moments of deep worry, even writing down your thoughts is a powerful act of courage.",
          "I can feel the tension you are carrying, and I want to remind you that you are safe here."
        ],
        validations: [
          "It is completely okay to feel scared, anxious, or overwhelmed by the future.",
          "Your nervous system is trying to protect you, even if the alarm feels way too loud right now.",
          "You do not need to have everything under control; it is safe to let go of the reins for a moment.",
          "Feeling paralyzed or flooded with emotion is a natural response to prolonged stress.",
          "Your feelings of anxiety are real and difficult, but they are not your ultimate truth.",
          "It is okay to feel fragile; you are navigating a lot of unseen pressure."
        ],
        insights: [
          "Anxiety is like a cloud passing through the sky of your mind—it is highly visible, but it is not the sky itself.",
          "The thoughts that are scaring you are just mental events, not absolute facts about your future.",
          "You have survived every single anxious moment you've faced, and your resilience is quiet but absolute.",
          "Often, anxiety is a sign that your heart is asking for deep, uninterrupted rest and safety.",
          "When we stop fighting the feeling and let it wash over us, it often loses its terrifying grip.",
          "You are strong enough to carry these feelings while staying anchored in the present moment."
        ],
        steps: [
          "Can you look around you right now and name three simple physical things you can see and touch?",
          "How can we gently bring your focus back to the simple rise and fall of your breath for just one minute?",
          "What is one worry you can physically write down and fold away to give your brain a break?",
          "Can you offer yourself a comforting physical gesture, like placing a warm hand over your heart?",
          "What is a soothing sound, smell, or space that helps you feel grounded when things are loud?",
          "If you could tell your anxiety 'I see you, but I am safe,' how would that feel in your body?"
        ],
        closers: [
          "You are safe, you are here, and this moment will pass gently.",
          "We are breathing with you through the storm. You are never alone.",
          "May a wave of calm, steady peace settle into your chest right now.",
          "Take all the time you need; there is absolutely no rush to feel perfectly fine.",
          "Sending you steady, grounding energy and the warmest of thoughts.",
          "Rest your mind. You have done enough for today."
        ]
      },
      healing: {
        openers: [
          "There is such a beautiful, hopeful light shining through the words of your story today.",
          "I can feel the gentle bloom of healing and self-discovery in your reflection.",
          "Your words bring a warm sense of progress, peace, and quiet resilience to this space.",
          "It is wonderful to witness you finding your footing and embracing your own growth.",
          "You are charting a beautiful path toward wholeness, and your progress is worth celebrating.",
          "I am deeply moved by the sense of gratitude, hope, and steady healing you are sharing."
        ],
        validations: [
          "Your happiness and peace are fully earned, and you deserve to soak them in completely.",
          "Every step forward, no matter how small or quiet, is a monumental victory in your journey.",
          "It is completely valid to feel both proud of your growth and protective of your healing space.",
          "You are allowed to feel lighthearted and hopeful, even if there are still challenges around.",
          "Your resilience is a gorgeous, active force that has brought you to this peaceful place.",
          "It is okay to celebrate your progress and acknowledge how far you've truly come."
        ],
        insights: [
          "Healing is not about the absence of pain, but the expanding capacity to hold joy alongside it.",
          "Your story is a beautiful reminder that winters always give way to gentle, warm springs.",
          "The love and care you've poured into your own recovery is returning to you in beautiful ways.",
          "You are becoming the safe harbor you always needed, and that is a profound achievement.",
          "Each moment of gratitude and peace expands your capacity to experience the beauty of life.",
          "Your journey inspires others here, proving that healing is possible and real."
        ],
        steps: [
          "How can you reward or treat yourself today to celebrate this beautiful step of growth?",
          "Can you write down three things that are bringing you genuine peace or hope right now?",
          "How can you share a tiny bit of this healing warmth with someone else in the harbor today?",
          "What is one promise you want to make to yourself to keep nurturing your inner garden?",
          "How can you anchor this feeling of peace in your physical body so you can recall it later?",
          "What does the next chapter of your beautiful healing journey look like to you?"
        ],
        closers: [
          "We are celebrating your growth and holding your hope close to our hearts.",
          "May your light continue to shine brightly and guide your path forward.",
          "Wishing you continued peace, joy, and beautiful days of discovery.",
          "Thank you for sharing your healing light with our harbor community.",
          "Sending you endless support as you continue to bloom so beautifully.",
          "You are a beacon of hope and strength. Keep shining."
        ]
      },
      general: {
        openers: [
          "Thank you for sharing your heart with us; your story is safe and valued in this harbor.",
          "I can hear the deep reflection and sincerity in your words today.",
          "It takes genuine courage to put your thoughts and feelings into words like this.",
          "Your story is an important part of our community tapestry, and I am listening closely.",
          "I want to acknowledge the depth of your experiences and the honesty of your voice.",
          "Sharing your internal world is a powerful way to find connection and ease your spirit."
        ],
        validations: [
          "Whatever you are feeling in this moment is completely valid and allowed to exist.",
          "You do not have to carry everything by yourself; it is okay to share the weight.",
          "Your experience matters, and you deserve to be met with compassion and kindness.",
          "It is completely okay if you are still figuring things out; life is a journey of steps.",
          "Your emotional depth and sensitivity are profound strengths, not weaknesses.",
          "You are worthy of space, time, and gentle care as you process these moments."
        ],
        insights: [
          "Often, writing down our stories helps us see our own lives with a bit more kindness.",
          "You are a resilient soul, capable of navigating both calm seas and turbulent waves.",
          "Every experience you live through adds depth, wisdom, and beauty to who you are.",
          "Even when things feel cloudy, your inner compass is steady and working.",
          "You are connected to a quiet, supportive community of friends who understand.",
          "Every small moment of reflection brings you closer to your own core peace."
        ],
        steps: [
          "What is one warm, supportive thought you can tell yourself right now?",
          "How can you make your immediate surroundings a tiny bit more comfortable or peaceful today?",
          "Would you be open to taking three slow, deep breaths to let these words settle in?",
          "What is a small creative outlet or hobby that helps you feel most connected to yourself?",
          "Is there a gentle question about your story that you'd like to sit with or journal about?",
          "How can you show yourself a touch of appreciation for your courage in sharing today?"
        ],
        closers: [
          "We are so glad you are here with us in the harbor today.",
          "Wishing you a peaceful mind, a light heart, and gentle moments ahead.",
          "You are not alone in your journey; we are walking with you.",
          "May you find comfort in knowing your story has been received with love.",
          "Sending you warm, supportive thoughts and steady comfort.",
          "Be kind to yourself. You are doing the very best you can."
        ]
      }
    };

    let cat = 'general';
    if (category.includes('grief') || category.includes('loss') || textLower.includes('grief') || textLower.includes('loss') || textLower.includes('died') || textLower.includes('death') || textLower.includes('cry') || textLower.includes('passed away')) {
      cat = 'grief';
    } else if (category.includes('anxiety') || category.includes('fear') || textLower.includes('scared') || textLower.includes('anxious') || textLower.includes('anxiety') || textLower.includes('panic') || textLower.includes('fear') || textLower.includes('worry') || textLower.includes('overwhelmed')) {
      cat = 'anxiety';
    } else if (category.includes('relationship') || category.includes('love') || textLower.includes('friend') || textLower.includes('partner') || textLower.includes('husband') || textLower.includes('wife') || textLower.includes('family') || textLower.includes('mother') || textLower.includes('father') || textLower.includes('brother') || textLower.includes('sister') || textLower.includes('breakup')) {
      cat = 'relationships';
    } else if (category.includes('career') || category.includes('work') || category.includes('school') || textLower.includes('job') || textLower.includes('career') || textLower.includes('exam') || textLower.includes('test') || textLower.includes('stress') || textLower.includes('burnout')) {
      cat = 'career';
    } else if (category.includes('healing') || category.includes('progress') || textLower.includes('heal') || textLower.includes('progress') || textLower.includes('better') || textLower.includes('grateful') || textLower.includes('happy') || textLower.includes('peace') || textLower.includes('strength')) {
      cat = 'healing';
    }

    const idCode = story.id ? story.id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) : 12;
    const textLen = (story.text || '').length;

    const group = matrices[cat];
    const opener = group.openers[(idCode + textLen) % group.openers.length];
    const validation = group.validations[(idCode * 3 + textLen) % group.validations.length];
    const insight = group.insights[(idCode * 7 + textLen) % group.insights.length];
    const step = group.steps[(idCode * 11 + textLen) % group.steps.length];
    const closer = group.closers[(idCode * 13 + textLen) % group.closers.length];

    summary = `${opener} ${validation} ${insight} ${step} ${closer}`;
  }

  textEl.textContent = `"${summary}"`;
  btn.remove();
}

function wireEvents(isOwner) {
  el('back-btn')?.addEventListener('click', handleBackToFeed);
  el('btn-ai-reflect')?.addEventListener('click', (e) => {
    e.preventDefault();
    generateAiReflection();
  });
  el('btn-translate')?.addEventListener('click', (e) => { e.preventDefault(); handleTranslate(); });
  el('btn-gold')?.addEventListener('click', (e) => { e.preventDefault(); window.openGoldModal(story.id); });
  el('btn-edit')?.addEventListener('click', (e) => { e.preventDefault(); window.openEditStoryModal(story.id); });
  el('btn-delete')?.addEventListener('click', (e) => { e.preventDefault(); handleDeleteStory(); });
  el('btn-share')?.addEventListener('click', (e) => { e.preventDefault(); handleShare(); });
  el('btn-flag')?.addEventListener('click', (e) => { e.preventDefault(); handleReport(story.id, 'story'); });

  document.querySelectorAll('.story-reaction:not(.comment-react)').forEach(btn => {
    btn.addEventListener('click', (e) => { e.preventDefault(); handleReaction(btn.dataset.emoji, e); });
  });

  document.querySelectorAll('.comment-react').forEach(btn => {
    btn.addEventListener('click', (e) => { e.preventDefault(); handleCommentReaction(btn.dataset.comment, btn.dataset.emoji, e); });
  });

  document.querySelectorAll('.comment-gold-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.preventDefault(); window.openGoldModal(btn.dataset.goldStory || story.id, true); });
  });

  wireProfileAvatars();

  const commentInput = el('new-comment');
  if (commentInput) setupRealtimeInputHighlighting(commentInput);
  document.querySelectorAll('.reply-text').forEach(input => {
    setupRealtimeInputHighlighting(input);
  });

  el('comment-form')?.addEventListener('submit', handleAddComment);
  el('new-comment')?.addEventListener('input', (e) => {
    const countEl = el('comment-count');
    if (countEl) countEl.textContent = `${e.target.value.length}/1000`;
    const warnEl = el('comment-warning');
    if (warnEl) warnEl.hidden = true;
  });

  document.querySelectorAll('[data-reply]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      activeReplyParentId = activeReplyParentId === btn.dataset.reply ? null : btn.dataset.reply;
      renderStory();
    });
  });
  document.querySelectorAll('.cancel-reply').forEach(btn => {
    btn.addEventListener('click', (e) => { e.preventDefault(); activeReplyParentId = null; renderStory(); });
  });
  document.querySelectorAll('.submit-reply').forEach(btn => {
    btn.addEventListener('click', (e) => { e.preventDefault(); handleAddReply(btn.dataset.parent); });
  });

  document.querySelectorAll('[data-pin]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.preventDefault(); handleTogglePin(btn.dataset.pin, btn.dataset.pinned === 'true'); });
  });
  document.querySelectorAll('[data-report-comment]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.preventDefault(); handleReport(btn.dataset.reportComment, 'comment'); });
  });

  // 🔥 Delete comment and delete reply listeners
  document.querySelectorAll('[data-delete-comment]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.preventDefault(); handleDeleteComment(btn.dataset.deleteComment); });
  });
  document.querySelectorAll('[data-delete-reply]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.preventDefault(); handleDeleteComment(btn.dataset.deleteReply); });
  });
}

async function reloadComments() {
  const { user, userData } = getState();
  if (!currentStoryId) return;
  const commentsQ = query(collection(db, 'comments'), where('storyId', '==', currentStoryId), orderBy('createdAt', 'desc'));
  const commentsSnap = await getDocs(commentsQ);
  comments = [];
  commentsSnap.forEach(d => {
    const c = d.data();
    if (c.approved || userData?.isAdmin || c.userId === user?.uid) {
      const rx = c.reactions || { '❤️': 0, '🙏': 0, '😢': 0, '💪': 0, '🤗': 0 };
      commentReactions[d.id] = rx;
      comments.push({ id: d.id, ...c, reactions: rx });
    }
  });
  if (user) {
    const commentRxSnap = await getDocs(collection(db, 'users', user.uid, 'commentReactions'));
    userCommentReactions = {};
    commentRxSnap.forEach(d => { userCommentReactions[d.id] = d.data().emojis || []; });
  }
  activeReplyParentId = null;
  renderStory();
}

async function loadStory() {
  const storyId = getQueryParam('id');
  if (!storyId) {
    console.warn('⚠️ No story selected. Triggering fallback redirection...');
    showToast('⚠️ No story selected. Returning to feed.', 'warning');
    navigateTo('feed');
    return;
  }
  console.log('✅ Loading story ID:', storyId);
  currentStoryId = storyId;
  localStorage.setItem('LAST_VIEWED_STORY_ID', storyId);

  const { user, userData } = getState();
  
  let isBackground = false;
  if (story && story.id === storyId) {
    isBackground = true;
    renderStory();
    handleHashScroll();
  } else {
    renderLoading();
  }
  try {
    const docSnap = await getDoc(doc(db, 'stories', storyId));
    if (!docSnap.exists()) { renderError(t('story_not_found', 'Story not found.')); return; }
    const data = docSnap.data();
    if (!data.approved && !userData?.isAdmin && data.userId !== user?.uid) {
      renderError(t('story_pending', 'This story is pending approval or has been flagged.'));
      return;
    }
    story = { id: docSnap.id, ...data };

    // Increment view count in background
    recordStoryView(storyId, user?.uid).then((incremented) => {
      if (incremented) {
        story.views = (story.views || 0) + 1;
        if (currentStoryId === storyId) {
          renderStory();
        }
      }
    });

    const commentsQ = query(collection(db, 'comments'), where('storyId', '==', storyId), orderBy('createdAt', 'desc'));
    const commentsSnap = await getDocs(commentsQ);
    comments = [];
    commentsSnap.forEach(d => {
      const c = d.data();
      if (c.approved || userData?.isAdmin || c.userId === user?.uid) {
        const rx = c.reactions || { '❤️': 0, '🙏': 0, '😢': 0, '💪': 0, '🤗': 0 };
        commentReactions[d.id] = rx;
        comments.push({ id: d.id, ...c, reactions: rx });
      }
    });

    if (user) {
      const reactSnap = await getDoc(doc(db, 'users', user.uid, 'reactions', storyId));
      userReactions = reactSnap.exists() ? (reactSnap.data().emojis || []) : [];
      const commentRxSnap = await getDocs(collection(db, 'users', user.uid, 'commentReactions'));
      userCommentReactions = {};
      commentRxSnap.forEach(d => { userCommentReactions[d.id] = d.data().emojis || []; });
    }
    renderStory();
    handleHashScroll();
  } catch (err) {
    renderError(err.message || t('story_load_error', 'An error occurred loading the story.'));
  }
}

function handleHashScroll(customHash) {
  const hash = typeof customHash === 'string' ? customHash : window.location.hash;
  if (!hash) return;
  if (hash.includes('reactions')) {
    setTimeout(() => {
      const rxEl = document.querySelector('.story-reactions');
      if (rxEl) {
        rxEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        rxEl.style.outline = '3px solid var(--color-danger)';
        rxEl.style.borderRadius = 'var(--radius-lg)';
        rxEl.style.padding = '0.5rem';
        rxEl.style.transition = 'all 0.4s ease';
        setTimeout(() => {
          rxEl.style.outline = '';
          rxEl.style.padding = '';
        }, 4000);
      }
    }, 300);
    return;
  }
  const match = hash.match(/comment-([a-zA-Z0-9_-]+)/);
  if (!match) return;
  const commentId = match[1];
  highlightedCommentId = commentId;
  renderStory();
  setTimeout(() => {
    const targetEl = document.getElementById(`comment-${commentId}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => {
      highlightedCommentId = null;
      renderStory();
    }, 4000);
  }, 300);
}

async function handleTranslate() {
  const { language } = getState();
  if (isTranslated) { isTranslated = false; renderStory(); return; }
  if (translatedText) { isTranslated = true; renderStory(); return; }
  const btn = el('btn-translate');
  if (btn) btn.textContent = `🌐 ${t('translating', 'Translating...')}`;
  try {
    translatedTitle = await translateText(story.title, language);
    translatedText = await translateText(story.text, language);
    isTranslated = true;
    showToast(t('translation_complete', '✅ Translation complete'), 'success');
  } catch {
    showToast(t('translation_failed', '❌ Translation failed'), 'error');
  }
  renderStory();
}

function handleShare() {
  const url = `${window.location.origin}${window.location.pathname}?id=${story.id}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url);
    showToast(t('link_copied', '📋 Link copied to clipboard!'), 'success');
  } else {
    showToast(`${t('link', 'Link')}: ${url}`, 'info');
  }
}

function handleDeleteStory() {
  showConfirm(t('delete_story', 'Delete Story?'), t('delete_story_confirm', 'Are you sure you want to permanently delete this story? This cannot be undone.'), false, async () => {
    try {
      await updateDoc(doc(db, 'stories', story.id), { approved: false, visibility: 'private' });
      showToast(t('story_deleted', '✅ Story deleted.'), 'success');
      navigateTo('feed');
    } catch (err) {
      showToast(`${t('delete_failed', '❌ Delete failed')}: ${err.message}`, 'error');
    }
  });
}

async function handleReaction(emoji, e) {
  const { user, userData } = getState();
  if (!user?.emailVerified) { showToast(t('verify_email_first', '📧 Please verify your email first.'), 'warning'); return; }
  triggerFloatingEmoji(emoji, e.clientX, e.clientY);
  if (isLoveReaction(emoji)) playLoveDrop();
  else playToneForEvent(e.target);
  const hasReacted = userReactions.includes(emoji);
  const prevUserRx = [...userReactions];
  const prevStory = { ...story, reactions: { ...story.reactions } };
  userReactions = hasReacted ? userReactions.filter(r => r !== emoji) : [...userReactions, emoji];
  const reactions = { ...story.reactions };
  reactions[emoji] = Math.max((reactions[emoji] || 0) + (hasReacted ? -1 : 1), 0);
  story = { ...story, reactions };
  renderStory();
  try {
    await runTransaction(db, async (tx) => {
      const storyRef = doc(db, 'stories', story.id);
      const storySnap = await tx.get(storyRef);
      if (!storySnap.exists()) return;
      const delta = hasReacted ? -1 : 1;
      const reactionField = `reactions.${emoji}`;
      tx.update(storyRef, { [reactionField]: increment(delta) });
      tx.set(doc(db, 'users', user.uid, 'reactions', story.id), { emojis: userReactions, storyId: story.id, timestamp: new Date().toISOString() }, { merge: true });
      if (isLoveReaction(emoji)) {
        const authorId = resolveAuthorId(storySnap.data());
        if (authorId !== user.uid) {
          applyLovePointsInTransaction(tx, {
            authorUid: authorId,
            authorName: storySnap.data().authorName,
            storyId: story.id,
            reactorUid: user.uid,
            reactorName: userData?.name,
            isAdding: !hasReacted,
          });
          if (!hasReacted) {
            tx.set(doc(collection(db, 'notifications')), {
              toUid: authorId, fromUid: user.uid, fromName: userData?.name || t('someone', 'Someone'),
              type: 'like', data: { storyId: story.id }, read: false, createdAt: new Date().toISOString(),
            });
          }
        }
      }
    });
  } catch (err) {
    console.warn('Reaction failed:', err);
    userReactions = prevUserRx;
    story = prevStory;
    renderStory();
    showToast(t('reaction_failed', '❌ Reaction could not be saved.'), 'error');
  }
}

async function handleCommentReaction(commentId, emoji, e) {
  const { user } = getState();
  if (!user?.emailVerified) { showToast(t('verify_email_first', '📧 Please verify your email first.'), 'warning'); return; }
  triggerFloatingEmoji(emoji, e.clientX, e.clientY);
  if (isLoveReaction(emoji)) playLoveDrop();
  else playToneForEvent(e.target);
  const current = userCommentReactions[commentId] || [];
  const hasReacted = current.includes(emoji);
  userCommentReactions[commentId] = hasReacted ? current.filter(r => r !== emoji) : [...current, emoji];
  comments = comments.map(c => {
    if (c.id !== commentId) return c;
    const reactions = { ...(c.reactions || commentReactions[commentId] || {}) };
    reactions[emoji] = Math.max((reactions[emoji] || 0) + (hasReacted ? -1 : 1), 0);
    commentReactions[commentId] = reactions;
    return { ...c, reactions };
  });
  renderStory();
  try {
    await runTransaction(db, async (tx) => {
      const commentRef = doc(db, 'comments', commentId);
      const commentSnap = await tx.get(commentRef);
      if (!commentSnap.exists()) return;
      const reactions = { ...(commentSnap.data().reactions || { '❤️': 0, '🙏': 0, '😢': 0, '💪': 0, '🤗': 0 }) };
      reactions[emoji] = Math.max((reactions[emoji] || 0) + (hasReacted ? -1 : 1), 0);
      tx.update(commentRef, { reactions });
      tx.set(doc(db, 'users', user.uid, 'commentReactions', commentId), {
        emojis: userCommentReactions[commentId], commentId, storyId: currentStoryId, timestamp: new Date().toISOString(),
      }, { merge: true });

      if (isLoveReaction(emoji) && !hasReacted) {
        const authorId = resolveAuthorId(commentSnap.data());
        if (authorId && authorId !== user.uid) {
          const userData = getState().userData;
          tx.set(doc(collection(db, 'notifications')), {
            toUid: authorId,
            fromUid: user.uid,
            fromName: userData?.name || t('someone', 'Someone'),
            type: 'like',
            data: { storyId: currentStoryId, commentId: commentId },
            read: false,
            createdAt: new Date().toISOString(),
          });
        }
      }
    });
  } catch (err) { console.warn('Comment reaction failed:', err); }
}

async function handleAddComment(e) {
  e.preventDefault();
  const { user, userData } = getState();
  if (!user?.emailVerified) { showToast(t('verify_email_first', '📧 Please verify your email first.'), 'warning'); return; }
  const text = el('new-comment').value.trim();
  if (text.length < 3) { showToast(t('comment_min_chars', 'Comment must be at least 3 characters.'), 'warning'); return; }

  if (checkVulgarWords(text)) {
    const errorMsg = 'Inappropriate words detected. Submission blocked to keep The Harbor safe.';
    const warnEl = el('comment-warning');
    if (warnEl) {
      warnEl.innerHTML = `
        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--color-danger); border-radius: 0.5rem; padding: 0.75rem; color: var(--color-danger); font-size: 0.75rem; line-height: 1.4;">
          <strong style="display: block; margin-bottom: 0.15rem; font-size: 0.8125rem">⚠️ Security Blocked Trigger</strong>
          Your comment contains language that violates our community guidelines. This attempt has been logged under your account for manual moderation review.
        </div>
      `;
      warnEl.hidden = false;
    }
    showToast(`⚠️ ${errorMsg}`, 'error');
    logFlaggedAttempt({ storyId: story.id, text }, 'comment');
    return;
  }

  const isAnonymous = el('comment-anon').checked;
  const authorName = isAnonymous ? t('anonymous', 'Anonymous') : (userData?.name || t('friend', 'Friend'));
  const flagged = await moderateContent(text);
  const approved = !flagged;
  if (flagged) showToast(t('comment_held', '⚠️ Comment held for review due to community guidelines.'), 'warning');

  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const storyRef = doc(db, 'stories', story.id);
      const userRef = doc(db, 'users', user.uid);
      const commentRef = doc(collection(db, 'comments'));
      transaction.set(commentRef, {
        storyId: story.id, text, authorId: user.uid, userId: user.uid, authorName,
        isAnonymous, parentId: null, createdAt: now,
        likes: [], reactions: { '❤️': 0, '🙏': 0, '😢': 0, '💪': 0, '🤗': 0 }, isPinned: false, approved, replyCount: 0,
      });
      if (approved) {
        transaction.update(storyRef, { commentCount: increment(1) });
        transaction.update(userRef, { commentCount: increment(1) });
      }
      if (resolveAuthorId(story) !== user.uid) {
        transaction.set(doc(collection(db, 'notifications')), {
          toUid: resolveAuthorId(story), fromUid: user.uid, fromName: authorName,
          type: 'comment',
          data: { storyId: story.id, commentId: commentRef.id },
          read: false, createdAt: now,
        });
      }
    });
    showToast(t('comment_posted', '✅ Comment posted!'), 'success');
    await reloadComments();
  } catch (err) {
    showToast(`${t('comment_failed', '❌ Comment failed')}: ${err.message}`, 'error');
  }
}

// 🔥 Reply respects anonymous checkbox
async function handleAddReply(parentId) {
  const { user, userData } = getState();
  const text = document.querySelector('.reply-text')?.value.trim();
  if (!text || text.length < 3) { showToast(t('reply_min_chars', 'Reply must be at least 3 characters.'), 'warning'); return; }

  if (checkVulgarWords(text)) {
    const errorMsg = 'Inappropriate words detected. Submission blocked to keep The Harbor safe.';
    showToast(`⚠️ ${errorMsg}`, 'error');
    logFlaggedAttempt({ storyId: story.id, parentId, text }, 'comment-reply');
    return;
  }

  const isAnonymous = document.querySelector('.reply-anon')?.checked ?? false;
  const authorName = isAnonymous ? t('anonymous', 'Anonymous') : (userData?.name || t('friend', 'Friend'));

  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const parentRef = doc(db, 'comments', parentId);
      const parentSnap = await transaction.get(parentRef);
      const parentAuthorId = parentSnap.exists() ? resolveAuthorId(parentSnap.data()) : null;

      const replyRef = doc(collection(db, 'comments'));
      transaction.set(replyRef, {
        storyId: story.id, text, authorId: user.uid, userId: user.uid, authorName,
        isAnonymous, parentId, createdAt: now, likes: [],
        reactions: { '❤️': 0, '🙏': 0, '😢': 0, '💪': 0, '🤗': 0 }, isPinned: false, approved: true, replyCount: 0,
      });
      transaction.update(parentRef, { replyCount: increment(1) });
      transaction.update(doc(db, 'stories', story.id), { commentCount: increment(1) });

      if (parentAuthorId && parentAuthorId !== user.uid) {
        transaction.set(doc(collection(db, 'notifications')), {
          toUid: parentAuthorId, fromUid: user.uid, fromName: authorName,
          type: 'reply',
          data: { storyId: story.id, commentId: replyRef.id, parentId },
          read: false, createdAt: now,
        });
      }
    });
    showToast(t('reply_posted', '✅ Reply posted!'), 'success');
    await reloadComments();
  } catch (err) {
    showToast(`${t('reply_failed', '❌ Reply failed')}: ${err.message}`, 'error');
  }
}

// 🔥 Delete a comment and all its replies
async function handleDeleteComment(commentId) {
  const { user } = getState();
  if (!user) return;

  const comment = comments.find(c => c.id === commentId);
  if (!comment) return;

  // Check permission: user must be comment author OR story owner
  const isOwner = user && resolveAuthorId(story) === user.uid;
  const commentAuthorId = resolveAuthorId(comment) || comment.userId;
  if (commentAuthorId !== user.uid && !isOwner) {
    showToast('You do not have permission to delete this comment.', 'error');
    return;
  }

  showConfirm(
    '🗑️ Delete Comment',
    'Are you sure you want to delete this comment and all its replies? This cannot be undone.',
    false,
    async () => {
      try {
        // Find all replies to this comment
        const replyIds = comments.filter(c => c.parentId === commentId).map(c => c.id);
        const allIds = [commentId, ...replyIds];

        const batch = writeBatch(db);
        allIds.forEach(id => {
          batch.delete(doc(db, 'comments', id));
        });
        // Update story comment count
        batch.update(doc(db, 'stories', story.id), {
          commentCount: increment(-allIds.length),
        });
        await batch.commit();

        showToast(`✅ ${allIds.length} comment(s) deleted.`, 'success');
        await reloadComments();
      } catch (err) {
        showToast(`❌ Delete failed: ${err.message}`, 'error');
      }
    }
  );
}

async function handleTogglePin(commentId, currentlyPinned) {
  const { user, userData } = getState();
  const isStoryAuthor = user && resolveAuthorId(story) === user.uid;
  if (!isStoryAuthor && !userData?.isAdmin) {
    showToast(t('pin_permission_denied', 'Only the story author can pin comments.'), 'error');
    return;
  }

  try {
    await runTransaction(db, async (transaction) => {
      const storyRef = doc(db, 'stories', story.id);
      const commentRef = doc(db, 'comments', commentId);
      if (currentlyPinned) {
        transaction.update(commentRef, { isPinned: false });
        transaction.update(storyRef, { pinnedCommentId: null });
      } else {
        if (story.pinnedCommentId) {
          transaction.update(doc(db, 'comments', story.pinnedCommentId), { isPinned: false });
        }
        transaction.update(commentRef, { isPinned: true });
        transaction.update(storyRef, { pinnedCommentId: commentId });
      }
    });
    story.pinnedCommentId = currentlyPinned ? null : commentId;
    showToast(currentlyPinned ? t('comment_unpinned', '📌 Comment unpinned') : t('comment_pinned', '📌 Comment pinned!'), 'success');
    await reloadComments();
  } catch (err) {
    showToast(`${t('pin_failed', '❌ Pin failed')}: ${err.message}`, 'error');
  }
}

const VULGAR_REGEX = /\b(shit|fuck|damn|asshole|bitch|crap|vulgar|bastard|dick|pussy|cunt)\b/i;

function handleReport(targetId, type) {
  const { user } = getState();
  if (!user) {
    showToast(t('login_required', '🔐 Please sign in to flag or report content.'), 'warning');
    return;
  }
  if (!user.emailVerified) {
    showToast(t('verify_email_first', '📧 Please verify your email first.'), 'warning');
    return;
  }
  showConfirm(t('report_content_title', '⚠️ Report Community Content'), t('report_content_msg', 'Please state the reason for flagging this content. If approved, it will be removed.'), true, async (reason) => {
    const { userData } = getState();
    try {
      let textToCheck = reason || '';
      if (type === 'story') {
        const snap = await getDoc(doc(db, 'stories', targetId));
        if (snap.exists()) { const d = snap.data(); textToCheck += ` ${d.title || ''} ${d.text || ''}`; }
      } else if (type === 'comment') {
        const snap = await getDoc(doc(db, 'comments', targetId));
        if (snap.exists()) textToCheck += ` ${snap.data().text || ''}`;
      }
      const isVulgar = VULGAR_REGEX.test(textToCheck);
      if (isVulgar) {
        if (type === 'story') await updateDoc(doc(db, 'stories', targetId), { approved: false, visibility: 'private' });
        else if (type === 'comment') await updateDoc(doc(db, 'comments', targetId), { approved: false });
        showToast(t('content_blocked', '⚠️ Content containing vulgar words was automatically blocked from public view and held for review.'), 'info');
      }
      const { addDoc } = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js');
      await addDoc(collection(db, 'reports'), {
        reportedId: targetId, type, reason, reportedBy: user?.uid || 'guest',
        reporterName: userData?.name || t('someone', 'Someone'), status: 'pending',
        createdAt: new Date().toISOString(), autoBlocked: isVulgar,
      });
      showToast(t('report_submitted', '✅ Report submitted. Thank you for keeping The Harbor safe.'), 'success');
      if (isVulgar) {
        if (type === 'story') navigateTo('feed');
        else await reloadComments();
      }
    } catch (err) {
      showToast(`${t('report_failed', '❌ Report failed')}: ${err.message}`, 'error');
    }
  });
}

function init() {
  initBugReport();
  const handleScrollEvent = (e) => {
    if (e.detail?.hash) handleHashScroll(e.detail.hash);
  };
  window.addEventListener('hashchange', handleHashScroll);
  registerPageCleanup(() => window.removeEventListener('hashchange', handleHashScroll));

  window.addEventListener('harbor:scroll-target', handleScrollEvent);
  registerPageCleanup(() => window.removeEventListener('harbor:scroll-target', handleScrollEvent));

  const onStoryUpdated = (e) => {
    if (e.detail?.storyId === currentStoryId) loadStory();
  };
  window.addEventListener('story-updated', onStoryUpdated);
  registerPageCleanup(() => window.removeEventListener('story-updated', onStoryUpdated));

  const onGoldDonated = (e) => {
    if (detectCurrentPageKey() !== 'story') return;
    if (e.detail?.storyId === currentStoryId && story) {
      story = {
        ...story,
        totalGold: (story.totalGold || 0) + e.detail.amount,
        goldReceived: (story.goldReceived || 0) + e.detail.amount,
      };
      renderStory();
    }
  };
  window.addEventListener('gold-donated', onGoldDonated);
  registerPageCleanup(() => window.removeEventListener('gold-donated', onGoldDonated));

  loadStory();
}

guardAuth(init, 'story');