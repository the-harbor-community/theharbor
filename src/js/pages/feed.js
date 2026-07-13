/**
 * Feed page — story listing, categories, reactions
 * Refactored with persistent shell – no flicker.
 */
import { subscribe, getState, t, showToast, navigateTo, getFeedScroll, setFeedCategory, getFeedCategory, captureFeedState, shouldRestoreFeed, markFeedRestored } from '../store.js';
import { bindCategoryPopovers } from '../utils/category-popover.js';
import { db, increment, resolveAuthorId, recordStoryView, handleFirestoreError, OperationType } from '../firebase.js';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs, doc, runTransaction, getDoc,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { triggerFloatingEmoji, debounce, passesGenderFilter, REACTION_EMOJIS, pageEl, setPageText, setPagePlaceholder, formatTimeAgo, getCategoryIconSvg } from '../utils.js';
import { initBugReport } from '../page-common.js';
import { applyLovePointsInTransaction, isLoveReaction } from '../love-points.js';
import { onPageEnter, detectCurrentPageKey, registerPageSubscription, registerPageCleanup } from '../router.js';
import { createPageShell } from '../utils/page-shell.js';

let stories = [];
let lastDoc = null;
let hasMore = true;
let loading = false;
let activeCategory = getFeedCategory();
let userReactions = {};
let searchTerm = '';
let scrollRestored = false;
let cachedSearchStories = null;

// 🔥 Persistent shell & fetch locks
let _mounted = false;
let _fetching = false;
let pageShell = null;

function updateScrollProgress() {
  const container = document.getElementById('scroll-progress-container');
  const bar = document.getElementById('scroll-progress-bar');
  if (!container || !bar) return;
  if (detectCurrentPageKey() !== 'feed') {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  const cards = Array.from(document.querySelectorAll('app-story-card'));
  const totalCount = cards.length;
  if (totalCount === 0) {
    bar.style.width = '0%';
    return;
  }

  let viewedCount = 0;
  const viewportBottom = window.innerHeight;
  cards.forEach(card => {
    const rect = card.getBoundingClientRect();
    if (rect.top < viewportBottom) {
      viewedCount++;
    }
  });

  const percentage = (viewedCount / totalCount) * 100;
  bar.style.width = `${percentage}%`;
}

function getCategories(userData) {
  const base = [
    { code: 'all', label: t('all', 'All'), icon: '🌊' },
    { code: 'trending', label: t('trending', 'Trending'), icon: '🔥' },
    { code: 'port', label: t('tab_port', 'Port'), icon: '⚓' },
    { code: 'struggles', label: t('tab_storm', 'Storm'), icon: '⛈️' },
    { code: 'fun', label: t('tab_sunny', 'Sunny'), icon: '☀️' },
    { code: 'learning', label: t('tab_compass', 'Compass'), icon: '🧭' },
    { code: 'my-stories', label: t('my_stories', 'My Stories'), icon: '📝' },
  ];
  if (userData?.gender === '🧔 Man') base.splice(2, 0, { code: 'men', label: t('tab_men', 'Man'), icon: '🧔' });
  if (userData?.gender === '👩 Woman') base.splice(2, 0, { code: 'women', label: t('tab_women', 'Woman'), icon: '👩' });
  return base;
}

function filterByGender(list, userData) {
  return list.filter((s) => passesGenderFilter(s.category, userData?.gender, userData?.isAdmin));
}

function renderTabs() {
  const { userData } = getState();
  const tabs = pageEl('feed-tabs');
  if (!tabs) return;
  tabs.innerHTML = getCategories(userData).map(cat =>
    `<button class="feed-tab category-tab${activeCategory === cat.code ? ' active' : ''}" role="tab" data-cat="${cat.code}">${getCategoryIconSvg(cat.code)} ${cat.label}</button>`
  ).join('');
  
  const tabBtns = tabs.querySelectorAll('.feed-tab');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      activeCategory = btn.dataset.cat;
      setFeedCategory(activeCategory);
      scrollRestored = false;
      renderTabs();
      fetchStories();
    });
  });

  bindCategoryPopovers(tabBtns, (btn) => btn.dataset.cat);
}

function saveScrollBeforeLeave(storyId) {
  captureFeedState(window.scrollY, activeCategory);
  navigateTo('story', { id: storyId });
}

async function openStoryPreviewModal(storyId) {
  let story = stories.find(s => s.id === storyId);
  if (!story) {
    try {
      const docRef = doc(db, 'stories', storyId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        story = { id: docSnap.id, ...docSnap.data() };
      }
    } catch (err) {
      console.error('Failed to fetch story for preview:', err);
    }
  }
  if (!story) return;

  const modal = document.getElementById('story-preview-modal');
  if (!modal) return;

  const categoryEl = document.getElementById('preview-modal-category');
  const titleEl = document.getElementById('preview-modal-title');
  const avatarEl = document.getElementById('preview-modal-avatar');
  const authorEl = document.getElementById('preview-modal-author');
  const metaEl = document.getElementById('preview-modal-meta');
  const contentEl = document.getElementById('preview-modal-content');
  const viewFullBtn = document.getElementById('preview-modal-view-full');

  if (categoryEl) categoryEl.textContent = story.category || 'struggles';
  if (titleEl) titleEl.textContent = story.title || 'Untitled';
  if (avatarEl) avatarEl.textContent = story.isAnonymous ? '🕊️' : (story.authorAvatar || '👤');
  if (authorEl) authorEl.textContent = story.isAnonymous ? t('anonymous', 'Anonymous') : (story.authorName || 'Friend');
  if (contentEl) contentEl.textContent = story.text || '';
  
  if (metaEl) {
    const dateStr = formatTimeAgo(story.createdAt);
    const words = (story.text || '').trim().split(/\s+/).length;
    const readingTime = `${Math.max(1, Math.ceil(words / 200))} min read`;
    const views = story.views || 0;
    metaEl.textContent = `${dateStr} · ⏱️ ${readingTime} · 👁️ ${views} views`;
  }

  const { user } = getState();
  recordStoryView(storyId, user?.uid).then((incremented) => {
    if (incremented) {
      story.views = (story.views || 0) + 1;
      updateStoryCard(storyId);
      if (metaEl) {
        const dateStr = formatTimeAgo(story.createdAt);
        const words = (story.text || '').trim().split(/\s+/).length;
        const readingTime = `${Math.max(1, Math.ceil(words / 200))} min read`;
        metaEl.textContent = `${dateStr} · ⏱️ ${readingTime} · 👁️ ${story.views} views`;
      }
    }
  });

  if (viewFullBtn) {
    const newBtn = viewFullBtn.cloneNode(true);
    viewFullBtn.parentNode.replaceChild(newBtn, viewFullBtn);
    newBtn.addEventListener('click', () => {
      modal.hidden = true;
      saveScrollBeforeLeave(storyId);
    });
  }

  modal.hidden = false;
  
  const closeBtn = document.getElementById('preview-modal-close');
  const cancelBtn = document.getElementById('preview-modal-cancel');
  const closeModal = () => { modal.hidden = true; };
  if (closeBtn) closeBtn.onclick = closeModal;
  if (cancelBtn) cancelBtn.onclick = closeModal;
}

function restoreScrollPosition() {
  if (scrollRestored || !shouldRestoreFeed()) return;
  const y = getFeedScroll();
  if (y >= 0) {
    scrollRestored = true;
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
      markFeedRestored();
    });
  }
}

function updateStoryCard(storyId, searchRoot = document) {
  if (detectCurrentPageKey() !== 'feed') return;
  const story = stories.find(s => s.id === storyId);
  if (!story) return;
  const { user, bookmarks } = getState();
  const card = searchRoot.querySelector(`app-story-card[story-id="${CSS.escape(storyId)}"]`);
  if (!card) return;
  card.setReactions(story.reactions, userReactions[storyId], handleReaction);
  card.showGoldButton(user && resolveAuthorId(story) !== user.uid);
  if (bookmarks?.includes(storyId)) {
    card.setAttribute('bookmarked', '');
  } else {
    card.removeAttribute('bookmarked');
  }
  card.setAttribute('views', String(story.views || 0));
}

function renderStories(isAppending = false) {
  const container = pageEl('stories-container');
  if (!container) return;
  container.style.opacity = '1';
  const { user } = getState();
  const filtered = filterByGender(stories.filter(s => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return s.title?.toLowerCase().includes(term) || s.text?.toLowerCase().includes(term) || s.authorName?.toLowerCase().includes(term);
  }), getState().userData);

  if (loading && !stories.length) {
    const listBuffer = document.createElement('div');
    listBuffer.innerHTML = '<div class="feed-skeleton"></div><div class="feed-skeleton"></div>';
    container.replaceChildren(...listBuffer.childNodes);
    return;
  }
  if (!filtered.length) {
    const emptyBuffer = document.createElement('div');
    emptyBuffer.innerHTML = `
      <div class="feed-empty animate-fade-in" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4rem 2rem; text-align:center;">
        <div style="font-size: 4rem; margin-bottom: 1rem; filter: drop-shadow(0 4px 12px rgba(16,185,129,0.15)); animation: floatGentle 4s ease-in-out infinite;">⚓</div>
        <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.5rem;">${t('no_results_title', 'The Harbor is quiet right now')}</h3>
        <p style="font-size: var(--text-xs); color: var(--text-muted); max-width: 24rem; margin: 0 auto 1.5rem;">
          ${t('no_results_desc', "We couldn't find any stories matching your search. Try checking your spelling or adjusting your filters!")}
        </p>
        <button id="clear-search-btn" class="btn btn--secondary btn--sm" style="font-size: 0.75rem; padding: 0.5rem 1rem; border-radius: var(--radius-full);">${t('clear_search', 'Clear Search')}</button>
      </div>`;
    
    const clearBtn = emptyBuffer.querySelector('#clear-search-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const input = pageEl('search-input');
        if (input) {
          input.value = '';
          searchTerm = '';
          renderStories();
        }
      });
    }
    container.replaceChildren(...emptyBuffer.childNodes);

    const loadMoreWrap = pageEl('load-more-wrap');
    if (loadMoreWrap) loadMoreWrap.hidden = true;
    restoreScrollPosition();
    updateScrollProgress();
    return;
  }

  const listBuffer = document.createElement('div');
  const existingContainerCards = Array.from(container.querySelectorAll('app-story-card'));
  const recycledMap = new Map();
  existingContainerCards.forEach(card => {
    const id = card.getAttribute('story-id');
    if (id) recycledMap.set(id, card);
  });

  if (isAppending) {
    listBuffer.append(...container.childNodes);
  }

  filtered.forEach((story, index) => {
    const existingCard = recycledMap.get(story.id);
    if (existingCard) {
      existingCard.setAttribute('gold', String(story.totalGold || story.goldReceived || 0));
      existingCard.setAttribute('comments', String(story.commentCount || 0));
      existingCard.setAttribute('views', String(story.views || 0));
      
      const { bookmarks } = getState();
      if (bookmarks?.includes(story.id)) {
        existingCard.setAttribute('bookmarked', '');
      } else {
        existingCard.removeAttribute('bookmarked');
      }
      
      existingCard.setReactions(story.reactions, userReactions[story.id], handleReaction);
      existingCard.showGoldButton(user && resolveAuthorId(story) !== user.uid);
      listBuffer.appendChild(existingCard);
      return;
    }

    const card = document.createElement('app-story-card');
    card.setAttribute('story-id', story.id);
    card.setAttribute('author-id', resolveAuthorId(story));
    card.setAttribute('user-id', resolveAuthorId(story));
    card.setAttribute('title', story.title || '');
    card.setAttribute('text', story.text || '');
    card.setAttribute('author', story.authorName || '');
    card.setAttribute('author-avatar', story.isAnonymous ? '🕊️' : (story.authorAvatar || '👤'));
    card.setAttribute('category', story.category || '');
    card.setAttribute('date', formatTimeAgo(story.createdAt));
    if (story.isAnonymous) card.setAttribute('anonymous', '');
    card.setAttribute('gold', String(story.totalGold || story.goldReceived || 0));
    card.setAttribute('comments', String(story.commentCount || 0));
    card.setAttribute('views', String(story.views || 0));
    
    const { bookmarks } = getState();
    if (bookmarks?.includes(story.id)) card.setAttribute('bookmarked', '');
    
    card.style.animationDelay = `${Math.min(index * 0.05, 0.4)}s`;

    listBuffer.appendChild(card);
    card.setReactions(story.reactions, userReactions[story.id], handleReaction);
    card.showGoldButton(user && resolveAuthorId(story) !== user.uid);
    card.setNavigateHandler((id) => openStoryPreviewModal(id), activeCategory);
  });
  
  container.replaceChildren(...listBuffer.childNodes);

  const loadMoreWrap = pageEl('load-more-wrap');
  if (loadMoreWrap) loadMoreWrap.hidden = !hasMore;
  restoreScrollPosition();
  updateScrollProgress();
}

async function fetchStories(loadMore = false) {
  if (_fetching) return;
  _fetching = true;

  const { user, userData } = getState();
  if (!user) { _fetching = false; return; }
  if (loadMore && !hasMore) { _fetching = false; return; }
  
  loading = true;
  
  const container = pageEl('stories-container');
  if (!loadMore) {
    lastDoc = null;
    hasMore = true;
    if (stories.length > 0) {
      renderStories(false);
      if (container) {
        container.style.opacity = '0.6';
        container.style.transition = 'opacity 0.15s ease';
      }
    } else {
      stories = [];
      renderStories(false);
    }
  } else {
    renderStories(loadMore);
  }

  try {
    let q = query(collection(db, 'stories'), where('approved', '==', true));

    if (activeCategory === 'trending') {
      let tQ = query(collection(db, 'stories'), where('approved', '==', true), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(50));
      const snap = await getDocs(tQ);
      const list = [];
      snap.forEach(d => {
        const data = d.data();
        if (!passesGenderFilter(data.category, userData?.gender, userData?.isAdmin)) return;
        list.push({ id: d.id, ...data });
      });
      list.sort((a, b) => {
        const sumA = Object.values(a.reactions || {}).reduce((s, c) => s + (Number(c) || 0), 0);
        const sumB = Object.values(b.reactions || {}).reduce((s, c) => s + (Number(c) || 0), 0);
        return sumB - sumA;
      });
      stories = list;
      hasMore = false;
      lastDoc = null;
      loading = false;
      renderStories(loadMore);
      return;
    } else if (activeCategory === 'my-stories') {
      q = query(q, where('userId', '==', user.uid));
    } else if (activeCategory === 'port') {
      const following = userData?.following || [];
      if (!following.length) { stories = []; hasMore = false; loading = false; renderStories(loadMore); return; }
      let combined = [];
      for (let i = 0; i < following.length; i += 10) {
        const chunk = following.slice(i, i + 10);
        const chunkQ = query(
          collection(db, 'stories'),
          where('approved', '==', true),
          where('visibility', '==', 'public'),
          where('userId', 'in', chunk),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        const snap = await getDocs(chunkQ);
        snap.forEach(d => combined.push({ id: d.id, ...d.data() }));
      }
      combined = filterByGender(combined, userData);
      combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const offset = loadMore ? stories.length : 0;
      const nextBatch = combined.slice(offset, offset + 10);
      stories = loadMore ? [...stories, ...nextBatch] : nextBatch;
      hasMore = combined.length > offset + nextBatch.length;
      loading = false;
      renderStories(loadMore);
      return;
    } else if (activeCategory !== 'all') {
      q = query(q, where('category', '==', activeCategory), where('visibility', '==', 'public'));
    } else {
      q = query(q, where('visibility', '==', 'public'));
    }

    q = query(q, orderBy('createdAt', 'desc'), limit(10));
    if (loadMore && lastDoc) q = query(q, startAfter(lastDoc));

    const snap = await getDocs(q);
    const list = [];
    snap.forEach(d => {
      const data = d.data();
      if (!passesGenderFilter(data.category, userData?.gender, userData?.isAdmin)) return;
      if (!userData?.isAdmin && activeCategory === 'all') {
        if (data.category === 'men' && userData?.gender !== '🧔 Man') return;
        if (data.category === 'women' && userData?.gender !== '👩 Woman') return;
      }
      list.push({ id: d.id, ...data });
    });

    lastDoc = snap.docs[snap.docs.length - 1] || null;
    if (snap.docs.length < 10) hasMore = false;
    stories = loadMore ? [...stories, ...list] : list;
  } catch (err) {
    console.error('Feed load error:', err);
  }
  loading = false;
  renderStories(loadMore);
  _fetching = false;
}

async function loadUserReactions() {
  const { user } = getState();
  if (!user) return;
  try {
    const snap = await getDocs(collection(db, 'users', user.uid, 'reactions'));
    userReactions = {};
    snap.forEach(d => { userReactions[d.id] = d.data().emojis || []; });
  } catch { /* noop */ }
}

async function handleReaction(storyId, emoji, e) {
  const { user, userData } = getState();
  if (!user?.emailVerified) { showToast(t('verify_email_first', '📧 Please verify your email first.'), 'warning'); return; }
  triggerFloatingEmoji(emoji, e.clientX, e.clientY);
  const current = userReactions[storyId] || [];
  const hasReacted = current.includes(emoji);
  const prevUserRx = [...current];
  const prevStories = stories.map(s => ({ ...s, reactions: { ...s.reactions } }));
  userReactions[storyId] = hasReacted ? current.filter(r => r !== emoji) : [...current, emoji];
  stories = stories.map(s => {
    if (s.id !== storyId) return s;
    const reactions = { ...s.reactions };
    reactions[emoji] = Math.max((reactions[emoji] || 0) + (hasReacted ? -1 : 1), 0);
    return { ...s, reactions };
  });
  updateStoryCard(storyId);
  try {
    await runTransaction(db, async (tx) => {
      const storyRef = doc(db, 'stories', storyId);
      const storySnap = await tx.get(storyRef);
      if (!storySnap.exists()) return;
      const delta = hasReacted ? -1 : 1;
      const reactionField = `reactions.${emoji}`;
      tx.update(storyRef, { [reactionField]: increment(delta) });
      tx.set(doc(db, 'users', user.uid, 'reactions', storyId), { emojis: userReactions[storyId], storyId, timestamp: new Date().toISOString() }, { merge: true });
      if (isLoveReaction(emoji)) {
        const authorId = resolveAuthorId(storySnap.data());
        if (authorId !== user.uid) {
          applyLovePointsInTransaction(tx, {
            authorUid: authorId,
            authorName: storySnap.data().authorName,
            storyId,
            reactorUid: user.uid,
            reactorName: userData?.name,
            isAdding: !hasReacted,
          });
          if (!hasReacted) {
            tx.set(doc(collection(db, 'notifications')), {
              toUid: authorId, fromUid: user.uid, fromName: userData?.name || t('someone', 'Someone'),
              type: 'like', data: { storyId }, read: false, createdAt: new Date().toISOString(),
            });
          }
        }
      }
    });
  } catch (err) {
    console.warn('Reaction failed:', err);
    userReactions[storyId] = prevUserRx;
    stories = prevStories;
    updateStoryCard(storyId);
    showToast(t('reaction_failed', '❌ Reaction could not be saved.'), 'error');
  }
}

function onScroll() {
  updateScrollProgress();
}

function onPageShow(e) {
  if (e.persisted || shouldRestoreFeed()) {
    activeCategory = getFeedCategory();
    scrollRestored = false;
    renderTabs();
    if (getState().user) loadUserReactions().then(() => fetchStories());
  }
}

function onPopState() {
  if (shouldRestoreFeed()) {
    activeCategory = getFeedCategory();
    scrollRestored = false;
  }
}

function onGoldDonated(e) {
  if (detectCurrentPageKey() !== 'feed') return;
  const { storyId, amount } = e.detail;
  stories = stories.map(s => s.id === storyId ? { ...s, totalGold: (s.totalGold || 0) + amount, goldReceived: (s.goldReceived || 0) + amount } : s);
  const card = document.querySelector(`app-story-card[story-id="${CSS.escape(storyId)}"]`);
  if (card) {
    const story = stories.find(s => s.id === storyId);
    if (story) {
      card.setAttribute('gold', String(story.totalGold || story.goldReceived || 0));
    }
  }
}

// 🔥 New init function using persistent shell
function init() {
  if (_mounted) return;
  _mounted = true;

  // Build persistent shell
  if (!pageShell) {
    pageShell = createPageShell('stories-root', `
      <section class="feed-hero animate-page-enter">
        <h1 id="hero-heading">⚓ Welcome to The Harbor</h1>
        <p id="hero-tagline">A safe place to share, heal, and grow — together.</p>
      </section>
      <div class="feed-search-container" style="display: flex; gap: 0.75rem; width: 100%; box-sizing: border-box; margin-bottom: 1.5rem; position: relative; max-width: 32rem; margin-inline: auto; padding: 0 var(--space-md); flex-wrap: nowrap;">
        <div style="flex: 1; position: relative; min-width: 0;">
          <label for="search-stories" class="sr-only">Stories</label>
          <input type="search" id="search-stories" class="input feed-search__input" placeholder="Stories" autocomplete="off" style="width: 100%; border-radius: var(--radius-lg); box-sizing: border-box; padding-left: 2.75rem; font-size: 0.8125rem; color: var(--text-primary); background-image: url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23a0aec0%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><circle cx=%2211%22 cy=%2211%22 r=%228%22></circle><line x1=%2221%22 y1=%2221%22 x2=%2216.65%22 y2=%2216.65%22></line></svg>'); background-repeat: no-repeat; background-position: 0.875rem center; background-size: 1rem;">
          <div id="stories-search-dropdown" class="search-results-dropdown" style="display: none; position: absolute; left: 0; right: 0; top: 100%; background: var(--color-card); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); z-index: 1000; max-height: 300px; overflow-y: auto; margin-top: 0.25rem;"></div>
        </div>
        <div style="flex: 1; position: relative; min-width: 0;">
          <label for="search-members" class="sr-only">Members</label>
          <input type="search" id="search-members" class="input feed-search__input" placeholder="Members" autocomplete="off" style="width: 100%; border-radius: var(--radius-lg); box-sizing: border-box; padding-left: 2.75rem; font-size: 0.8125rem; color: var(--text-primary); background-image: url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23a0aec0%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><circle cx=%2211%22 cy=%2211%22 r=%228%22></circle><line x1=%2221%22 y1=%2221%22 x2=%2216.65%22 y2=%2216.65%22></line></svg>'); background-repeat: no-repeat; background-position: 0.875rem center; background-size: 1rem;">
          <div id="members-search-dropdown" class="search-results-dropdown" style="display: none; position: absolute; left: 0; right: 0; top: 100%; background: var(--color-card); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); z-index: 1000; max-height: 300px; overflow-y: auto; margin-top: 0.25rem;"></div>
        </div>
      </div>
      <nav class="feed-tabs" id="feed-tabs" role="tablist" aria-label="Story categories"></nav>
      <div id="stories-container" class="feed-stories" aria-live="polite"></div>
      <div id="load-more-wrap" class="feed-load-more" hidden>
        <button id="load-more-btn" class="btn btn--secondary">📥 Load More</button>
      </div>
    `);
  }

  // Show the scroll progress container and reset bar width
  const container = document.getElementById('scroll-progress-container');
  if (container) {
    container.style.display = 'block';
    const bar = document.getElementById('scroll-progress-bar');
    if (bar) bar.style.width = '0%';
  }

  // Register cleanup for when leaving the feed page
  registerPageCleanup(() => {
    const container = document.getElementById('scroll-progress-container');
    if (container) container.style.display = 'none';
  });

  window.addEventListener('scroll', onScroll);
  registerPageCleanup(() => window.removeEventListener('scroll', onScroll));

  window.addEventListener('pageshow', onPageShow);
  registerPageCleanup(() => window.removeEventListener('pageshow', onPageShow));

  window.addEventListener('popstate', onPopState);
  registerPageCleanup(() => window.removeEventListener('popstate', onPopState));

  window.addEventListener('gold-donated', onGoldDonated);
  registerPageCleanup(() => window.removeEventListener('gold-donated', onGoldDonated));

  setPageText('hero-heading', `⚓ ${t('feed_hero_heading', 'Welcome to The Harbor')}`);
  setPageText('hero-tagline', t('feed_hero_tagline', 'A safe place to share, heal, and grow — together.'));
    
  // Setup dual search handlers
  const searchStoriesInput = pageEl('search-stories');
  const searchMembersInput = pageEl('search-members');
  const storiesDropdown = pageEl('stories-search-dropdown');
  const membersDropdown = pageEl('members-search-dropdown');

  if (searchStoriesInput) searchStoriesInput.placeholder = "Search stories";
  if (searchMembersInput) searchMembersInput.placeholder = "Search members";

  const handleStoriesSearch = debounce(async (queryVal) => {
    if (!queryVal.trim()) {
      if (storiesDropdown) {
        storiesDropdown.style.display = 'none';
        storiesDropdown.innerHTML = '';
      }
      return;
    }
    
    const term = queryVal.toLowerCase();
    if (!cachedSearchStories) {
      try {
        const snap = await getDocs(query(
          collection(db, 'stories'),
          where('approved', '==', true),
          where('visibility', '==', 'public'),
          orderBy('createdAt', 'desc'),
          limit(150)
        ));
        cachedSearchStories = [];
        snap.forEach(docSnap => {
          cachedSearchStories.push({ id: docSnap.id, ...docSnap.data() });
        });
      } catch (err) {
        console.error('Failed to fetch stories for search:', err);
      }
    }

    const matches = (cachedSearchStories || []).filter(s => 
      s.title?.toLowerCase().includes(term) || 
      s.text?.toLowerCase().includes(term) || 
      s.authorName?.toLowerCase().includes(term)
    );

    if (storiesDropdown) {
      if (matches.length === 0) {
        storiesDropdown.innerHTML = `<div style="padding: 1rem; text-align: center; font-size: 0.75rem; color: var(--text-muted);">No matching stories found</div>`;
      } else {
        const grouped = {};
        matches.forEach(story => {
          const cat = story.category || 'struggles';
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push(story);
        });

        let html = '';
        for (const [cat, catStories] of Object.entries(grouped)) {
          const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
          html += `
            <div style="background: var(--bg-secondary); padding: 0.375rem 0.75rem; font-size: 0.6875rem; font-weight: 800; color: var(--color-primary); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--color-border); border-top: 1px solid var(--color-border);">${catLabel}</div>
          `;
          html += catStories.map(story => `
            <div class="search-item" style="padding: 0.75rem 1rem; border-bottom: 1px solid var(--color-border); cursor: pointer; transition: background 0.15s;" data-story-id="${story.id}">
              <div style="font-weight: 700; font-size: 0.8125rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${story.title || 'Untitled'}</div>
              <div style="font-size: 0.7125rem; color: var(--text-muted); margin-top: 0.15rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${(story.text || '').substring(0, 80)}...</div>
              <div style="font-size: 0.625rem; color: var(--color-primary); font-weight: 700; margin-top: 0.15rem;">By ${story.authorName || 'Friend'}</div>
            </div>
          `).join('');
        }

        storiesDropdown.innerHTML = html;

        storiesDropdown.querySelectorAll('[data-story-id]').forEach(item => {
          item.addEventListener('click', (e) => {
            const storyId = item.dataset.storyId;
            if (storyId) {
              storiesDropdown.style.display = 'none';
              if (searchStoriesInput) searchStoriesInput.value = '';
              openStoryPreviewModal(storyId);
            }
          });
        });
      }
      storiesDropdown.style.display = 'block';
    }
  }, 400);

  let cachedMembers = null;
  const handleMembersSearch = debounce(async (queryVal) => {
    if (!queryVal.trim()) {
      if (membersDropdown) {
        membersDropdown.style.display = 'none';
        membersDropdown.innerHTML = '';
      }
      return;
    }

    const term = queryVal.toLowerCase();

    if (!cachedMembers) {
      try {
        const snap = await getDocs(query(collection(db, 'users'), where('isPublic', '==', true)));
        cachedMembers = [];
        snap.forEach(docSnap => {
          cachedMembers.push({ id: docSnap.id, ...docSnap.data() });
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'users');
      }
    }

    const matches = (cachedMembers || []).filter(u => 
      u.name?.toLowerCase().includes(term) || 
      u.bio?.toLowerCase().includes(term)
    );

    if (membersDropdown) {
      if (matches.length === 0) {
        membersDropdown.innerHTML = `<div style="padding: 1rem; text-align: center; font-size: 0.75rem; color: var(--text-muted);">No matching members found</div>`;
      } else {
        const grouped = { admins: [], members: [] };
        matches.forEach(u => {
          if (u.isAdmin) {
            grouped.admins.push(u);
          } else {
            grouped.members.push(u);
          }
        });

        let html = '';
        if (grouped.admins.length > 0) {
          html += `<div style="background: var(--bg-secondary); padding: 0.375rem 0.75rem; font-size: 0.6875rem; font-weight: 800; color: var(--color-danger); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--color-border); border-top: 1px solid var(--color-border);">⚓ Harbor Support Team</div>`;
          html += grouped.admins.map(u => `
            <div class="search-item" style="padding: 0.75rem 1rem; border-bottom: 1px solid var(--color-border); cursor: pointer; transition: background 0.15s; display: flex; align-items: center; gap: 0.5rem;" data-user-uid="${u.id}">
              <span style="font-size: 1.25rem;">${u.avatar || '👤'}</span>
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 700; font-size: 0.8125rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${u.name || 'Friend'}</div>
                <div style="font-size: 0.6875rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${u.bio || ''}</div>
              </div>
            </div>
          `).join('');
        }
        if (grouped.members.length > 0) {
          html += `<div style="background: var(--bg-secondary); padding: 0.375rem 0.75rem; font-size: 0.6875rem; font-weight: 800; color: var(--color-primary); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--color-border); border-top: 1px solid var(--color-border);">🌊 Community Members</div>`;
          html += grouped.members.map(u => `
            <div class="search-item" style="padding: 0.75rem 1rem; border-bottom: 1px solid var(--color-border); cursor: pointer; transition: background 0.15s; display: flex; align-items: center; gap: 0.5rem;" data-user-uid="${u.id}">
              <span style="font-size: 1.25rem;">${u.avatar || '👤'}</span>
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 700; font-size: 0.8125rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${u.name || 'Friend'}</div>
                <div style="font-size: 0.6875rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${u.bio || ''}</div>
              </div>
            </div>
          `).join('');
        }

        membersDropdown.innerHTML = html;

        membersDropdown.querySelectorAll('[data-user-uid]').forEach(item => {
          item.addEventListener('click', () => {
            const uid = item.dataset.userUid;
            if (uid) {
              membersDropdown.style.display = 'none';
              if (searchMembersInput) searchMembersInput.value = '';
              navigateTo(`profile`, { uid });
            }
          });
        });
      }
      membersDropdown.style.display = 'block';
    }
  }, 400);

  searchStoriesInput?.addEventListener('input', (e) => handleStoriesSearch(e.target.value));
  searchMembersInput?.addEventListener('input', (e) => handleMembersSearch(e.target.value));

  const onDocClick = (e) => {
    if (storiesDropdown && !searchStoriesInput?.contains(e.target) && !storiesDropdown.contains(e.target)) {
      storiesDropdown.style.display = 'none';
    }
    if (membersDropdown && !searchMembersInput?.contains(e.target) && !membersDropdown.contains(e.target)) {
      membersDropdown.style.display = 'none';
    }
  };
  document.addEventListener('click', onDocClick);
  registerPageCleanup(() => document.removeEventListener('click', onDocClick));

  pageEl('load-more-btn')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fetchStories(true); });
  initBugReport();

  // 🔥 Subscriptions: Only set up once.
  const unsub1 = subscribe('authLoading', () => {
    if (detectCurrentPageKey() !== 'feed') return;
    const { authLoading, user, userData } = getState();
    if (!authLoading && !user) navigateTo('welcome');
    if (!authLoading && user) {
      if (userData?.gender === '🧔 Man' && activeCategory === 'all' && !sessionStorage.getItem('feed_active_category')) {
        activeCategory = 'men';
        setFeedCategory('men');
      }
      if (userData?.gender === '👩 Woman' && activeCategory === 'all' && !sessionStorage.getItem('feed_active_category')) {
        activeCategory = 'women';
        setFeedCategory('women');
      }
      renderTabs();
      loadUserReactions().then(() => fetchStories());
    }
  });

  const unsub2 = subscribe('userData', () => { if (detectCurrentPageKey() === 'feed') renderTabs(); });
  const unsub3 = subscribe('bookmarks', () => {
    if (detectCurrentPageKey() !== 'feed') return;
    const { bookmarks } = getState();
    const cards = document.querySelectorAll('app-story-card');
    cards.forEach(card => {
      const id = card.getAttribute('story-id');
      if (id) {
        if (bookmarks?.includes(id)) {
          card.setAttribute('bookmarked', '');
        } else {
          card.removeAttribute('bookmarked');
        }
      }
    });
  });
  const unsub4 = subscribe('language', () => {
    if (detectCurrentPageKey() !== 'feed') return;
    setPageText('hero-heading', `⚓ ${t('feed_hero_heading', 'Welcome to The Harbor')}`);
    setPageText('hero-tagline', t('feed_hero_tagline', 'A safe place to share, heal, and grow — together.'));
    setPagePlaceholder('search-stories', "Search stories");
    setPagePlaceholder('search-members', "Search members");
    renderTabs();
  });

  registerPageSubscription(unsub1);
  registerPageSubscription(unsub2);
  registerPageSubscription(unsub3);
  registerPageSubscription(unsub4);

  if (!getState().authLoading && getState().user) {
    renderTabs();
    loadUserReactions().then(() => fetchStories());
  } else if (!getState().authLoading && !getState().user) {
    navigateTo('welcome');
  }
}

onPageEnter('feed', init);
