/**
 * Bookmarks page — view and manage saved stories
 */
import { getState, t, navigateTo, subscribe, showToast } from '../store.js';
import { registerPageSubscription, detectCurrentPageKey } from '../router.js';
import { db, doc } from '../firebase.js';
import { getDoc } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { initBugReport } from '../page-common.js';
import { guardAuth } from './shared.js';

let bookmarkedStories = [];
let loading = true;

function el(id) { return document.getElementById(id); }
function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function formatTimeAgo(dateInput) {
  if (!dateInput) return t('time_just_now', 'Just now');
  const date = new Date(dateInput);
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

function renderContent() {
  const container = el('bookmarks-root');
  if (!container) return;

  if (loading) {
    container.innerHTML = `
      <div class="page-header" style="margin-bottom: var(--space-md);">
        <h1>🔖 ${t('saved_stories_title', 'Saved Bookmarks')}</h1>
        <p>Your curated list of saved stories and expressions.</p>
      </div>
      <div class="page-skeleton" style="height: 12rem; margin-bottom: var(--space-md); border-radius: var(--radius-md);"></div>
      <div class="page-skeleton" style="height: 12rem; margin-bottom: var(--space-md); border-radius: var(--radius-md);"></div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="page-header" style="margin-bottom: var(--space-md); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-sm);">
      <div>
        <h1 style="margin: 0;">🔖 ${t('saved_stories_title', 'Saved Bookmarks')} (${bookmarkedStories.length})</h1>
        <p style="margin: 0.25rem 0 0; color: var(--text-secondary); font-size: var(--text-xs);">
          Your personal library of saved harbor stories.
        </p>
      </div>
      <button class="btn btn--secondary btn--sm" id="back-profile-btn" style="margin: 0;">👤 Back to Profile</button>
    </div>
    <div id="bookmarks-list" style="display: flex; flex-direction: column; gap: var(--space-md);">
      <!-- Story cards will be rendered here -->
    </div>
  `;

  // Bind back button
  el('back-profile-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    const { user } = getState();
    if (user) {
      navigateTo('profile', { uid: user.uid });
    } else {
      navigateTo('profile');
    }
  });

  const listContainer = el('bookmarks-list');
  if (!listContainer) return;

  if (bookmarkedStories.length === 0) {
    listContainer.innerHTML = `
      <div class="page-empty card" style="text-align: center; padding: var(--space-xl); color: var(--text-muted);">
        <span style="font-size: 3rem; display: block; margin-bottom: var(--space-sm);">🔖</span>
        <h3 style="margin: 0; font-weight: 700; color: var(--text-primary);">${t('no_bookmarks_yet', 'No saved stories yet.')}</h3>
        <p style="font-size: var(--text-xs); margin: 0.5rem 0 0; color: var(--text-secondary);">
          Click the bookmark icon on any story card in the feed to save it here.
        </p>
      </div>
    `;
    return;
  }

  const { user } = getState();

  bookmarkedStories.forEach((story, index) => {
    const card = document.createElement('app-story-card');
    card.setAttribute('story-id', story.id);
    card.setAttribute('author-id', story.userId || '');
    card.setAttribute('user-id', story.userId || '');
    card.setAttribute('title', story.title || '');
    card.setAttribute('text', story.text || '');
    card.setAttribute('author', story.authorName || t('anonymous', 'Anonymous'));
    card.setAttribute('category', story.category || 'general');
    card.setAttribute('date', formatTimeAgo(story.createdAt));
    if (story.isAnonymous) card.setAttribute('anonymous', '');
    card.setAttribute('gold', String(story.totalGold || story.goldReceived || 0));
    card.setAttribute('comments', String(story.commentCount || 0));
    card.setAttribute('views', String(story.views || 0));
    card.setAttribute('bookmarked', '');

    // Highlight own story if desired
    card.style.animationDelay = `${Math.min(index * 0.05, 0.4)}s`;

    listContainer.appendChild(card);

    // Setup reactions empty/state handling
    const userReactions = {}; // simple empty reactions or state if needed
    card.setReactions(story.reactions || {}, userReactions[story.id] || [], () => {});
    card.showGoldButton(user && story.userId !== user.uid);
    card.setNavigateHandler((id) => navigateTo('story', { id }));
  });
}

async function loadBookmarkedStories() {
  loading = true;
  renderContent();

  try {
    // 1. Retrieve bookmarked IDs from localStorage as explicitly requested
    let bookmarkedIds = [];
    const localSaved = localStorage.getItem('harbor_bookmarks');
    if (localSaved) {
      try {
        bookmarkedIds = JSON.parse(localSaved) || [];
      } catch (parseErr) {
        console.error('Failed to parse harbor_bookmarks from localStorage:', parseErr);
      }
    }

    // Fallback to store if localStorage was empty but store has them
    if (bookmarkedIds.length === 0) {
      bookmarkedIds = getState().bookmarks || [];
    }

    if (bookmarkedIds.length === 0) {
      bookmarkedStories = [];
      loading = false;
      renderContent();
      return;
    }

    // 2. Fetch corresponding story data
    const fetches = bookmarkedIds.map(async (storyId) => {
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
    // Sort by date or creation time descending
    bookmarkedStories.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  } catch (err) {
    console.error('Error loading bookmarked stories:', err);
    showToast(t('bookmark_error', 'Failed to load bookmark details.'), 'error');
  }

  loading = false;
  renderContent();
}

function init() {
  initBugReport();
  
  // Refresh content on any auth state or bookmark state update
  const unsubBookmarks = subscribe('bookmarks', () => {
    if (detectCurrentPageKey() === 'bookmarks') {
      loadBookmarkedStories();
    }
  });

  const unsubAuth = subscribe('user', () => {
    if (detectCurrentPageKey() === 'bookmarks') {
      loadBookmarkedStories();
    }
  });

  registerPageSubscription(unsubBookmarks);
  registerPageSubscription(unsubAuth);

  loadBookmarkedStories();
}

guardAuth(init, 'bookmarks');
