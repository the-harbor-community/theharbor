/**
 * Notifications page
 */
import { getState, showToast, navigateTo, subscribe } from '../store.js';
import { registerPageSubscription } from '../router.js';
import { db, doc, updateDoc, collection } from '../firebase.js';
import { getDocs, writeBatch, query, where, orderBy } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { initBugReport } from '../page-common.js';
import { guardAuth } from './shared.js';

let notifs = [];
let loading = true;
let unsubscribeUser = null;

function el(id) { return document.getElementById(id); }
function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function aggregateNotifications(rawNotifs) {
  const groups = {};
  const aggregated = [];
  
  rawNotifs.forEach(n => {
    const isLike = n.type === 'like';
    const isComment = n.type === 'comment' || n.type === 'reply';
    const storyId = n.data?.storyId;
    
    if (storyId && (isLike || isComment)) {
      const commentId = n.data?.commentId || '';
      const groupKey = `${n.type}_${storyId}_${commentId}`;
      
      if (!groups[groupKey]) {
        groups[groupKey] = {
          ...n,
          contributors: [n.fromName],
          rawIds: [n.id],
          count: 1,
          unread: !n.read,
          latestCreatedAt: n.createdAt
        };
      } else {
        const group = groups[groupKey];
        if (!group.contributors.includes(n.fromName)) {
          group.contributors.push(n.fromName);
        }
        group.rawIds.push(n.id);
        group.count += 1;
        if (!n.read) {
          group.unread = true;
        }
        if (new Date(n.createdAt) > new Date(group.latestCreatedAt)) {
          group.latestCreatedAt = n.createdAt;
          group.fromName = n.fromName;
        }
      }
    } else {
      aggregated.push({
        ...n,
        rawIds: [n.id],
        count: 1,
        unread: !n.read,
        latestCreatedAt: n.createdAt
      });
    }
  });
  
  Object.values(groups).forEach(group => {
    aggregated.push(group);
  });
  
  aggregated.sort((a, b) => {
    const timeA = new Date(a.latestCreatedAt || a.createdAt);
    const timeB = new Date(b.latestCreatedAt || b.createdAt);
    return timeB - timeA;
  });
  
  return aggregated;
}

function renderNotifText(n) {
  const name = `<strong style="color:var(--color-primary)">${esc(n.fromName)}</strong>`;
  const countOthers = n.count - 1;
  const suffix = countOthers > 0 ? ` and ${countOthers} other${countOthers > 1 ? 's' : ''}` : '';

  if (n.type === 'follow') return `👥 ${name} started following you!`;
  if (n.type === 'like') {
    if (n.data?.commentId) {
      return `❤️ ${name}${suffix} loved your comment!`;
    }
    return `❤️ ${name}${suffix} loved your story!`;
  }
  if (n.type === 'comment') {
    if (n.data?.parentId || n.data?.commentId) {
      return `💬 ${name}${suffix} replied to your comment!`;
    }
    return `💬 ${name}${suffix} commented on your story!`;
  }
  if (n.type === 'reply') {
    return `💬 ${name}${suffix} replied to your comment!`;
  }
  if (n.type === 'gold') {
    return `💰 ${name} sent you <strong style="color:#d97706">${n.data?.amount} 🪙 Gold</strong>${n.data?.message ? `<span style="display:block;font-style:italic;color:var(--text-muted);margin-top:0.25rem">"${esc(n.data.message)}"</span>` : ''}`;
  }
  if (n.type === 'welcome') {
    return `⚓ <strong style="color:var(--color-primary)">${esc(n.fromName)}</strong>: ${esc(n.data?.message || 'Welcome to the Harbor!')}`;
  }
  return esc(n.type);
}

function render() {
  const root = el('notifications-root');
  if (!root) {
    console.warn('notifications-root not found');
    return;
  }
  
  let listContainer = el('notifications-list');
  let headerContainer = el('notifications-header');
  if (!listContainer || !headerContainer) {
    const mainBuffer = document.createElement('div');
    mainBuffer.innerHTML = `
      <div id="notifications-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-lg);border-bottom:1px solid var(--color-border);padding-bottom:0.75rem">
        <div class="page-header" style="margin:0">
          <h1>🔔 Alerts Inbox</h1>
          <p>Stay updated with likes, comments, gold, and follow activity.</p>
        </div>
        <div id="mark-all-btn-container"></div>
      </div>
      <div id="notifications-list"></div>
    `;
    root.replaceChildren(...mainBuffer.childNodes);
    listContainer = el('notifications-list');
    headerContainer = el('notifications-header');
  }
  
  if (loading) {
    const listBuffer = document.createElement('div');
    listBuffer.innerHTML = '<div class="page-skeleton" style="margin: 2rem 0;"></div>';
    listContainer.replaceChildren(...listBuffer.childNodes);
    const btnContainer = root.querySelector('#mark-all-btn-container');
    if (btnContainer) {
      const btnBuffer = document.createElement('div');
      btnContainer.replaceChildren(...btnBuffer.childNodes);
    }
    return;
  }
  
  const aggregated = aggregateNotifications(notifs);
  const hasUnread = aggregated.some(n => n.unread);

  const btnContainer = root.querySelector('#mark-all-btn-container');
  if (btnContainer) {
    const btnBuffer = document.createElement('div');
    btnBuffer.innerHTML = hasUnread ? '<button class="btn btn--ghost" id="mark-all" style="font-size:var(--text-xs)">✓ Mark All Read</button>' : '';
    btnBuffer.querySelector('#mark-all')?.addEventListener('click', handleMarkAllRead);
    btnContainer.replaceChildren(...btnBuffer.childNodes);
  }

  const listBuffer = document.createElement('div');
  listBuffer.innerHTML = aggregated.length ? aggregated.map(n => `
    <div class="list-item card animate-fade-in" data-group-key="${n.rawIds.join(',')}" style="margin-bottom:var(--space-sm);display:flex;justify-content:space-between;align-items:center;cursor:pointer;${n.unread ? 'background:rgba(16,185,129,0.05);border-color:rgba(16,185,129,0.2)' : ''}">
      <div>
        <div style="font-size:var(--text-xs)">${renderNotifText(n)}</div>
        <div style="font-size:0.625rem;color:var(--text-muted);font-weight:700;margin-top:0.25rem">${new Date(n.latestCreatedAt || n.createdAt).toLocaleString()}</div>
      </div>
      ${n.unread ? '<span style="width:0.625rem;height:0.625rem;background:var(--color-primary);border-radius:var(--radius-full);flex-shrink:0"></span>' : ''}
    </div>`).join('') : '<div class="page-empty card">All quiet! No notifications yet.</div>';

  listBuffer.querySelectorAll('[data-group-key]').forEach(item => {
    item.addEventListener('click', () => {
      const groupNotif = aggregated.find(g => g.rawIds.join(',') === item.dataset.groupKey);
      if (groupNotif) {
        handleClick(groupNotif);
      }
    });
  });

  listContainer.replaceChildren(...listBuffer.childNodes);
}

async function fetchNotifs() {
  const { user } = getState();
  if (!user) {
    notifs = [];
    loading = false;
    render();
    return;
  }
  
  let isBackground = false;
  if (notifs.length > 0) {
    loading = false;
    isBackground = true;
    render();
  } else {
    loading = true;
    render();
  }
  
  try {
    const snap = await getDocs(query(collection(db, 'notifications'), where('toUid', '==', user.uid), orderBy('createdAt', 'desc')));
    notifs = [];
    snap.forEach(d => notifs.push({ id: d.id, ...d.data() }));
  } catch (err) { console.warn(err); }
  loading = false;
  render();
}

async function handleMarkAllRead() {
  const unread = notifs.filter(n => !n.read);
  if (!unread.length) return;
  try {
    const batch = writeBatch(db);
    unread.forEach(n => batch.update(doc(db, 'notifications', n.id), { read: true }));
    await batch.commit();
    notifs = notifs.map(n => ({ ...n, read: true }));
    showToast('✅ All alerts marked as read.', 'success');
    render();
  } catch (err) { showToast(`❌ Failed to update: ${err.message}`, 'error'); }
}

async function handleClick(notif) {
  if (!notif) return;
  if (notif.unread) {
    try {
      const batch = writeBatch(db);
      notif.rawIds.forEach(id => {
        batch.update(doc(db, 'notifications', id), { read: true });
      });
      await batch.commit();
      
      // Update local state
      notifs = notifs.map(n => {
        if (notif.rawIds.includes(n.id)) {
          return { ...n, read: true };
        }
        return n;
      });
    } catch (err) {
      console.warn('Failed to update read status:', err);
    }
  }
  
  if (notif.type === 'follow') {
    navigateTo('profile', { uid: notif.fromUid });
  } else if (notif.data?.storyId) {
    const hash = notif.data?.commentId ? `comment-${notif.data.commentId}` : undefined;
    navigateTo('story', { id: notif.data.storyId, hash });
  } else {
    navigateTo('feed');
  }
}

function init() {
  initBugReport();
  // 🔥 React to user changes
  const unsub = subscribe('user', fetchNotifs);
  registerPageSubscription(unsub);
  fetchNotifs();
}

guardAuth(init, 'notifications');