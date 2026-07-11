/**
 * Activity page — view contribution history, reactions, and gold donations
 */
import { getState, t, navigateTo, subscribe, showToast } from '../store.js';
import { registerPageSubscription } from '../router.js';
import { db, collection } from '../firebase.js';
import { getDocs, query, where } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { initBugReport } from '../page-common.js';
import { guardAuth } from './shared.js';

let activeTab = 'all'; // 'all', 'stories', 'comments', 'likes', 'gold'
let stories = [];
let comments = [];
let goldTransactions = [];
let loading = true;

function el(id) { return document.getElementById(id); }
function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function renderTabs() {
  const tabs = [
    { id: 'all', label: t('activity_all', 'All') },
    { id: 'stories', label: t('stories_title', 'Stories') },
    { id: 'comments', label: t('comments_title', 'Comments') },
    { id: 'likes', label: t('likes_title', 'Likes') },
    { id: 'gold', label: t('gold_balance', 'Gold') }
  ];

  return `
    <nav class="page-tabs" role="tablist" aria-label="Activity filters">
      ${tabs.map(tab => `
        <button class="page-tab ${activeTab === tab.id ? 'active' : ''}" 
                id="tab-${tab.id}" 
                role="tab" 
                aria-selected="${activeTab === tab.id ? 'true' : 'false'}" 
                data-tab="${tab.id}">
          ${tab.label}
        </button>
      `).join('')}
    </nav>
  `;
}

function renderContent() {
  const container = el('activity-root');
  if (!container) return;

  if (loading) {
    container.innerHTML = `
      <div class="page-header">
        <h1>📊 ${t('activity_heading', 'My Activity')}</h1>
        <p>Review your contributions and interactions in The Harbor community.</p>
      </div>
      <div class="page-skeleton"></div>
      <div class="page-skeleton"></div>
    `;
    return;
  }

  // Ensure base layout with tabs container and list container exists exactly once
  let listContainer = el('activity-list');
  let tabsContainer = el('activity-tabs-container');
  if (!listContainer || !tabsContainer) {
    container.innerHTML = `
      <div class="page-header">
        <h1>📊 ${t('activity_heading', 'My Activity')}</h1>
        <p>Review your contributions and interactions in The Harbor community.</p>
      </div>
      <div id="activity-tabs-container">${renderTabs()}</div>
      <div id="activity-list" style="margin-top:var(--space-md)"></div>
    `;
    listContainer = el('activity-list');
    tabsContainer = el('activity-tabs-container');
  } else {
    tabsContainer.innerHTML = renderTabs();
  }

  // Determine items based on activeTab
  let items = [];

  if (activeTab === 'all' || activeTab === 'stories') {
    stories.forEach(s => {
      items.push({
        type: 'story',
        date: new Date(s.createdAt || Date.now()),
        id: s.id,
        html: `
          <div class="list-item card" data-page="story" data-id="${s.id}" style="margin-bottom:var(--space-sm)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <span class="badge badge--success" style="margin-bottom:0.25rem">${t('story_tab', 'Story')}</span>
                <div style="font-size:var(--text-xs);font-weight:700;margin-top:0.25rem">${t('activity_wrote', 'You wrote')}: "${esc(s.title)}"</div>
                <div style="font-size:0.6875rem;color:var(--text-secondary);margin-top:0.25rem">${esc(s.text?.substring(0, 100))}${s.text?.length > 100 ? '...' : ''}</div>
              </div>
              <span style="font-size:0.625rem;color:var(--text-muted);white-space:nowrap">${new Date(s.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        `
      });
    });
  }

  if (activeTab === 'all' || activeTab === 'comments') {
    comments.forEach(c => {
      items.push({
        type: 'comment',
        date: new Date(c.createdAt || Date.now()),
        id: c.id,
        html: `
          <div class="list-item card" data-page="story" data-id="${c.storyId}" data-comment-id="${c.id}" style="margin-bottom:var(--space-sm)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <span class="badge badge--warning" style="margin-bottom:0.25rem">${t('comment_tab', 'Comment')}</span>
                <div style="font-size:var(--text-xs);font-weight:700;margin-top:0.25rem">${t('activity_commented', 'You commented')}:</div>
                <div style="font-size:0.6875rem;font-style:italic;color:var(--text-secondary);margin-top:0.25rem">"${esc(c.text)}"</div>
              </div>
              <span style="font-size:0.625rem;color:var(--text-muted);white-space:nowrap">${new Date(c.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        `
      });
    });
  }

  if (activeTab === 'all' || activeTab === 'likes') {
    // Stories with reactions
    stories.filter(s => {
      const rx = s.reactions || {};
      const totalLove = Object.values(rx).reduce((sum, count) => sum + (count || 0), 0);
      return totalLove > 0;
    }).forEach(s => {
      const rx = s.reactions || {};
      const totalLove = Object.values(rx).reduce((sum, count) => sum + (count || 0), 0);
      items.push({
        type: 'like',
        date: new Date(s.createdAt || Date.now()),
        id: s.id,
        html: `
          <div class="list-item card" data-page="story" data-id="${s.id}" style="margin-bottom:var(--space-sm)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <span class="badge badge--danger" style="margin-bottom:0.25rem">❤️ Love</span>
                <div style="font-size:var(--text-xs);font-weight:700;margin-top:0.25rem">${t('activity_total_love', 'Total love received on this story')}: <span style="color:var(--color-danger)">${totalLove} ❤️</span></div>
                <div style="font-size:0.625rem;color:var(--text-muted);margin-top:0.25rem">Story: "${esc(s.title)}"</div>
              </div>
              <span style="font-size:0.625rem;color:var(--text-muted);white-space:nowrap">${new Date(s.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        `
      });
    });
  }

  if (activeTab === 'all' || activeTab === 'gold') {
    goldTransactions.forEach(tx => {
      const isReceived = tx.toUid === getState().user?.uid;
      items.push({
        type: 'gold',
        date: new Date(tx.createdAt || Date.now()),
        id: tx.id,
        html: `
          <div class="list-item card" style="margin-bottom:var(--space-sm);cursor:default">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <span class="badge" style="background:#fef3c7;color:#d97706;margin-bottom:0.25rem">🪙 Gold</span>
                <div style="font-size:var(--text-xs);font-weight:700;margin-top:0.25rem">
                  ${isReceived 
                    ? `<span style="color:var(--color-success)">${esc(tx.fromName)}</span> ${t('activity_sent_you', 'sent you')} <span style="color:#d97706">${tx.amount} 🪙 Gold</span>` 
                    : `You sent <span style="color:#d97706">${tx.amount} 🪙 Gold</span> to <span style="color:var(--color-primary)">${esc(tx.toName)}</span>`}
                </div>
                ${tx.message ? `<div style="font-size:0.6875rem;font-style:italic;color:var(--text-secondary);margin-top:0.25rem">"${esc(tx.message)}"</div>` : ''}
              </div>
              <span style="font-size:0.625rem;color:var(--text-muted);white-space:nowrap">${new Date(tx.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        `
      });
    });
  }

  // Sort items by date desc
  items.sort((a, b) => b.date - a.date);

  // Empty state handling
  let emptyMsg = t('activity_no_activity', 'No activity found');
  if (activeTab === 'stories' && stories.length === 0) emptyMsg = t('activity_no_stories', 'No stories yet');
  if (activeTab === 'comments' && comments.length === 0) emptyMsg = t('activity_no_comments', 'No comments yet');
  if (activeTab === 'likes' && items.length === 0) emptyMsg = t('activity_no_likes', 'No likes received yet');
  if (activeTab === 'gold' && goldTransactions.length === 0) emptyMsg = t('activity_no_gold', 'No gold received yet');

  const contentHtml = items.length > 0 
    ? items.map(it => it.html).join('') 
    : `<div class="page-empty card">${emptyMsg}</div>`;

  if (listContainer) {
    listContainer.innerHTML = contentHtml;
  }

  // Bind tab click events
  document.querySelectorAll('.page-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      activeTab = tab.dataset.tab;
      renderContent();
    });
  });

  // Bind list item click events to navigate to stories
  document.querySelectorAll('[data-page="story"]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const storyId = item.dataset.id || localStorage.getItem('LAST_VIEWED_STORY_ID');
      const commentId = item.dataset.commentId;
      if (storyId) {
        const params = { id: storyId };
        if (commentId) {
          params.hash = `comment-${commentId}`;
        }
        navigateTo('story', params);
      } else {
        console.warn('⚠️ No story ID found in element or browser history/memory fallback.');
        showToast('⚠️ Unable to locate story identifier.', 'warning');
      }
    });
  });
}

async function fetchActivity() {
  const { user } = getState();
  if (!user) return;

  let isBackground = false;
  if (stories.length > 0 || comments.length > 0) {
    loading = false;
    isBackground = true;
    renderContent();
  } else {
    loading = true;
    renderContent();
  }

  try {
    // 1. Fetch user's stories
    const storiesSnap = await getDocs(query(collection(db, 'stories'), where('userId', '==', user.uid)));
    stories = [];
    storiesSnap.forEach(d => {
      stories.push({ id: d.id, ...d.data() });
    });

    // 2. Fetch user's comments
    const commentsSnap = await getDocs(query(collection(db, 'comments'), where('userId', '==', user.uid)));
    comments = [];
    commentsSnap.forEach(d => {
      comments.push({ id: d.id, ...d.data() });
    });

    // 3. Fetch gold transactions (both sent and received)
    const [sentSnap, receivedSnap] = await Promise.all([
      getDocs(query(collection(db, 'goldTransactions'), where('fromUid', '==', user.uid))),
      getDocs(query(collection(db, 'goldTransactions'), where('toUid', '==', user.uid)))
    ]);

    const txMap = new Map();
    sentSnap.forEach(d => txMap.set(d.id, { id: d.id, ...d.data() }));
    receivedSnap.forEach(d => txMap.set(d.id, { id: d.id, ...d.data() }));
    goldTransactions = Array.from(txMap.values());

  } catch (err) {
    console.error('Error fetching activity:', err);
    showToast(t('activity_error', 'Error loading activity'), 'error');
  }

  loading = false;
  renderContent();
}

function init() {
  initBugReport();
  const unsub = subscribe('user', fetchActivity);
  registerPageSubscription(unsub);
  fetchActivity();
}

guardAuth(init, 'activity');
