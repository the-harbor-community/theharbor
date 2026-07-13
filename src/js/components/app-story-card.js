/**
 * Reusable Story Card Web Component – Optimised for zero flicker
 */
import { escapeHtml, REACTION_EMOJIS, highlightVulgarWords } from '../utils.js';
import { navigateTo, captureFeedState, t } from '../store.js';

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host { display: block; }
  article {
    position: relative;
    background: var(--color-card); border: 1px solid var(--color-border);
    border-radius: var(--radius-xl); padding: 1rem 1.25rem;
    display: flex; flex-direction: column; gap: 0.75rem;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }
  article:hover { box-shadow: var(--shadow-md); border-color: var(--color-primary-light); transform: translateY(-2px); }
  @media (max-width: 767px) {
    :host { margin-left: 8px; margin-right: 8px; }
  }
  @media (max-width: 480px) {
    .gold-badge { font-size: 0.48rem !important; padding: 0.1rem 0.35rem !important; top: -0.35rem !important; left: -0.35rem !important; }
    .btn-gold { width: 1.25rem !important; height: 1.25rem !important; font-size: 0.5625rem !important; }
  }
  article.highlighted { border-color: var(--color-primary); box-shadow: 0 0 0 2px rgba(16,185,129,0.3); }
  .gold-badge {
    position: absolute; top: -0.5rem; left: -0.5rem;
    background: linear-gradient(to right,#fbbf24,#eab308); color: #065f46;
    font-size: 0.5625rem; font-weight: 900; padding: 0.125rem 0.5rem;
    border-radius: var(--radius-lg); border: 1px solid #fde047;
  }
  .bookmark-tag {
    position: absolute; top: 0.75rem; left: 0.75rem; z-index: 10;
    width: 1.625rem; height: 1.625rem; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    background: var(--bg-secondary); border: 1px solid var(--color-border);
    cursor: pointer; font-size: 0.8125rem; color: var(--text-muted);
    transition: transform 0.2s, background 0.2s, border-color 0.2s, color 0.2s;
  }
  .bookmark-tag:hover { transform: scale(1.1); }
  .bookmark-tag.active { background: rgba(16,185,129,0.15); border-color: var(--color-primary); color: var(--color-primary); }
  .header { display: flex; align-items: center; justify-content: space-between; padding-left: 1.75rem; }
  .author { display: flex; align-items: center; gap: 0.5rem; }
  .avatar {
    width: 2.25rem; height: 2.25rem; border-radius: 50%;
    background: linear-gradient(to right,var(--color-primary),var(--color-primary-light));
    color: #fff; display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: var(--text-sm); border: none; font-family: inherit; padding: 0;
  }
  .avatar--clickable { cursor: pointer; transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s; }
  .avatar--clickable:hover { transform: scale(1.08); box-shadow: 0 0 12px rgba(16,185,129,0.35); }
  .avatar--static { cursor: default; }
  .title { font-size: 1rem; font-weight: 700; cursor: pointer; color: var(--text-primary); margin: 0; border: none; background: none; font-family: inherit; text-align: left; padding: 0; width: 100%; }
  .title:hover { color: var(--color-primary); }
  .category { align-self: flex-start; font-size: 0.725rem; font-weight: 700; text-transform: uppercase; background: var(--bg-secondary); border: 1px solid var(--color-border); padding: 0.125rem 0.5rem; border-radius: var(--radius-full); color: var(--text-secondary); }
  .excerpt { font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-wrap; margin: 0; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; justify-content: space-between; padding-top: 0.75rem; border-top: 1px solid var(--color-border); }
  .reaction-row { display: flex; flex-wrap: nowrap; gap: 0.375rem; align-items: center; flex: 1; min-width: 0; overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .reaction-row::-webkit-scrollbar { display: none; }
  .reaction-row { -ms-overflow-style: none; scrollbar-width: none; }
  .reactions { display: flex; flex-wrap: nowrap; gap: 0.25rem; border: none !important; }
  .react-btn { padding: 0.15rem 0.45rem; border-radius: 8px; border: none; background: var(--bg-secondary); font-size: 0.75rem; cursor: pointer; font-family: inherit; transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s; }
  .react-btn:hover { transform: scale(1.08); }
  .react-btn:active { transform: scale(0.92); animation: reactPop 0.35s cubic-bezier(0.4, 0, 0.2, 1); }
  .react-btn.active { background: rgba(16,185,129,0.12); border-color: var(--color-primary); color: var(--color-primary); font-weight: 700; box-shadow: 0 0 8px rgba(16,185,129,0.2); }
  .meta-btns { display: flex; gap: 0.5rem; align-items: center; flex-shrink: 0; }
  .btn-sm { padding: 0.25rem 0.75rem; border-radius: var(--radius-full); font-size: 0.75rem; font-weight: 700; cursor: pointer; font-family: inherit; border: 1px solid var(--color-border); background: var(--bg-secondary); color: var(--text-secondary); transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
  .btn-sm:active { transform: scale(0.94); }
  .btn-gold {
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    color: #171717;
    border: none;
    font-size: 0.6875rem;
    padding: 0;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(245, 158, 11, 0.2);
    animation: goldPulse 2.5s ease-in-out infinite;
    transition: transform 0.2s;
  }
  .btn-gold:hover { filter: brightness(1.1); transform: translateY(-1px); }
  .wrapper { position: relative; }
  @keyframes rowEnter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes reactPop { 0% { transform: scale(0.85); } 50% { transform: scale(1.12); } 100% { transform: scale(1); } }
  @keyframes goldPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(234,179,8,0.35); } 50% { box-shadow: 0 0 10px 2px rgba(234,179,8,0.25); } }
  .views-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.375rem;
    border-radius: var(--radius-md);
    background: rgba(16, 185, 129, 0.08);
    color: var(--color-primary);
    font-size: 0.625rem;
    font-weight: 700;
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.3s;
    margin-left: 0.375rem;
  }
  .views-badge.pulse-active { animation: eyePulse 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); background: rgba(16, 185, 129, 0.2); }
  @keyframes eyePulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.2); }
    100% { transform: scale(1); }
  }
</style>
<div class="wrapper"><article id="card-article"><slot></slot></article></div>
`;

class AppStoryCard extends HTMLElement {
  static get observedAttributes() {
    return ['story-id', 'author-id', 'user-id', 'title', 'text', 'author', 'author-avatar', 'category', 'date', 'anonymous', 'gold', 'comments', 'views', 'highlighted', 'bookmarked'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._article = this.shadowRoot.getElementById('card-article');
    this._navHandler = null;
    this._activeCategory = 'all';
    this._onReact = null;
    this._reactions = {};
    this._userReactions = [];
    this._handlersBound = false;
    this._handleArticleClick = this._handleArticleClick.bind(this);
    this._built = false;
  }

  setNavigateHandler(fn, activeCategory = 'all') {
    this._navHandler = fn;
    this._activeCategory = activeCategory;
  }

  connectedCallback() {
    if (!this._handlersBound) {
      this._article.addEventListener('click', this._handleArticleClick);
      this._handlersBound = true;
    }
    if (!this._built) {
      this._build();
      this._built = true;
    } else {
      this._updateAllAttributes();
    }
  }

  disconnectedCallback() {
    this._article.removeEventListener('click', this._handleArticleClick);
    this._handlersBound = false;
  }

  _build() {
    const id = this.getAttribute('story-id') || '';
    const authorId = this._getAuthorId();
    const title = this.getAttribute('title') || t('untitled', 'Untitled');
    const text = this.getAttribute('text') || '';
    const author = this.getAttribute('author') || t('anonymous', 'Anonymous');
    const category = this.getAttribute('category') || '';
    const date = this.getAttribute('date') || t('recently', 'Recently');
    const isAnon = this.hasAttribute('anonymous');
    const gold = parseInt(this.getAttribute('gold') || '0', 10);
    const comments = this.getAttribute('comments') || '0';
    const views = parseInt(this.getAttribute('views') || '0', 10);
    const highlighted = this.hasAttribute('highlighted');
    const isBookmarked = this.hasAttribute('bookmarked');

    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const minRead = Math.max(1, Math.round(wordCount / 200));
    const readingTime = `${minRead} ${t('min_read', 'min read')}`;

    this._article.className = highlighted ? 'highlighted' : '';
    this._article.id = id ? `story-${id}` : '';

    const avatarCls = isAnon ? 'avatar avatar--static' : 'avatar avatar--clickable';
    const authorAvatar = this.getAttribute('author-avatar') || '👤';
    const avatarEl = isAnon
      ? `<div class="${avatarCls}" aria-hidden="true">🕊️</div>`
      : `<button type="button" class="${avatarCls} profile-avatar-link" data-action="profile" data-uid="${escapeHtml(authorId)}" aria-label="${t('view_profile', 'View profile')}">${escapeHtml(authorAvatar)}</button>`;

    this._article.innerHTML = `
      ${gold > 0 ? `<div class="gold-badge" id="gold-badge">🪙 ${gold} GOLD</div>` : ''}
      <button type="button" class="bookmark-tag ${isBookmarked ? 'active' : ''}" data-action="bookmark" title="${t('bookmark', 'Bookmark')}">🔖</button>
      <div class="header">
        <div class="author">
          ${avatarEl}
          <div>
            <strong style="font-size:var(--text-sm)">${isAnon ? `🕊️ ${t('anonymous', 'Anonymous')}` : escapeHtml(author)}</strong><br>
            <span style="font-size:0.75rem;color:var(--text-secondary);font-weight:500;">${escapeHtml(date)} · ⏱️ ${readingTime}</span>
            <span class="views-badge" id="views-badge" title="${views} views">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <span id="views-count">${views}</span>
            </span>
          </div>
        </div>
      </div>
      <button type="button" class="title" data-action="read">${highlightVulgarWords(escapeHtml(title))}</button>
      <span class="category">${escapeHtml(category)}</span>
      <p class="excerpt">${highlightVulgarWords(escapeHtml(text))}</p>
      <button type="button" class="btn-sm" data-action="read" style="align-self:flex-start;background:none;border:none;color:var(--color-secondary);font-weight:700">${t('read_more', 'Read More ▼')}</button>
      <div class="actions">
        <div class="reaction-row">
          <div class="reactions" id="reactions"></div>
        </div>
        <div class="meta-btns">
          <button type="button" class="btn-sm btn-gold donate-btn" data-action="gold" title="${t('donate', 'Donate')}">🪙</button>
          <button type="button" class="btn-sm" data-action="comments" id="comments-badge">💬 ${comments}</button>
        </div>
      </div>`;

    this._elements = {
      goldBadge: this._article.querySelector('#gold-badge'),
      viewsBadge: this._article.querySelector('#views-badge'),
      viewsCount: this._article.querySelector('#views-count'),
      commentsBadge: this._article.querySelector('#comments-badge'),
      reactionsContainer: this._article.querySelector('#reactions'),
      bookmarkBtn: this._article.querySelector('.bookmark-tag'),
    };

    this._paintReactions();
  }

  _updateAttribute(name, value) {
    const el = this._elements;
    if (!el) return;

    if (name === 'gold') {
      const num = parseInt(value) || 0;
      let badge = this._article.querySelector('#gold-badge');
      if (num > 0) {
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'gold-badge';
          badge.id = 'gold-badge';
          this._article.prepend(badge);
          el.goldBadge = badge;
        }
        badge.textContent = `🪙 ${num} GOLD`;
      } else if (badge) {
        badge.remove();
        el.goldBadge = null;
      }
    }
    if (name === 'comments' && el.commentsBadge) {
      el.commentsBadge.textContent = `💬 ${value}`;
    }
    if (name === 'views' && el.viewsCount) {
      el.viewsCount.textContent = value;
      if (el.viewsBadge) {
        el.viewsBadge.classList.remove('pulse-active');
        void el.viewsBadge.offsetWidth;
        el.viewsBadge.classList.add('pulse-active');
      }
    }
    if (name === 'bookmarked' && el.bookmarkBtn) {
      const isBookmarked = this.hasAttribute('bookmarked');
      el.bookmarkBtn.classList.toggle('active', isBookmarked);
    }
    if (name === 'highlighted') {
      this._article.classList.toggle('highlighted', this.hasAttribute('highlighted'));
    }
  }

  _updateAllAttributes() {
    const attrs = AppStoryCard.observedAttributes;
    attrs.forEach(name => {
      const value = this.getAttribute(name);
      if (value !== null) {
        this._updateAttribute(name, value);
      }
    });
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    this._updateAttribute(name, newVal);
  }

  _paintReactions() {
    const container = this._elements?.reactionsContainer;
    if (!container) return;

    if (container.children.length === 0) {
      REACTION_EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'react-btn';
        btn.dataset.emoji = emoji;
        btn.innerHTML = `${emoji} <strong>0</strong>`;
        container.appendChild(btn);
      });
    }

    const buttons = container.querySelectorAll('.react-btn');
    buttons.forEach((btn, index) => {
      const emoji = REACTION_EMOJIS[index];
      const count = this._reactions?.[emoji] || 0;
      const active = this._userReactions?.includes(emoji);
      btn.className = `react-btn${active ? ' active' : ''}`;
      btn.innerHTML = `${emoji} <strong>${count}</strong>`;
    });
  }

  setReactions(reactions, userReactions, onReact) {
    this._reactions = reactions || {};
    this._userReactions = userReactions || [];
    this._onReact = onReact;
    this._paintReactions();
  }

  showGoldButton(show) {
    const btn = this._article?.querySelector('[data-action="gold"]');
    if (btn) {
      btn.style.display = show ? '' : 'none';
    }
  }

  _getAuthorId() {
    return this.getAttribute('author-id') || this.getAttribute('user-id') || '';
  }

  _openStory(id) {
    if (this._navHandler) {
      this._navHandler(id);
      return;
    }
    captureFeedState(window.scrollY, this._activeCategory);
    navigateTo('story', { id });
  }

  _openProfile(uid) {
    if (!uid) return;
    navigateTo('profile', { uid });
  }

  _handleArticleClick(e) {
    const reactBtn = e.target.closest('.react-btn');
    if (reactBtn) {
      e.preventDefault();
      e.stopPropagation();
      const emoji = reactBtn.dataset.emoji;
      if (emoji && this._onReact) {
        this._onReact(this.getAttribute('story-id'), emoji, e);
      }
      return;
    }

    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;

    e.preventDefault();
    e.stopPropagation();

    const id = this.getAttribute('story-id') || '';
    const action = actionEl.dataset.action;
    const authorId = this._getAuthorId();
    const isAnon = this.hasAttribute('anonymous');

    if (action === 'read') this._openStory(id);
    else if (action === 'comments') this._openStory(id);
    else if (action === 'profile' && !isAnon) {
      const uid = actionEl.getAttribute('data-uid') || authorId;
      if (uid) this._openProfile(uid);
    } else if (action === 'gold') {
      window.openGoldModal?.(id);
    } else if (action === 'bookmark') {
      const isBookmarked = this.hasAttribute('bookmarked');
      this.dispatchEvent(new CustomEvent('story-bookmark-toggle', {
        bubbles: true,
        composed: true,
        detail: { id, isBookmarked: !isBookmarked }
      }));
    }
  }
}

customElements.define('app-story-card', AppStoryCard);
