/**
 * Uniform <SkeletonStories> Component
 * Mimics the exact visual grid and structural dimensions of the completed story card block
 */

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    width: 100%;
  }
  .skeleton-card {
    position: relative;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    overflow: hidden;
    min-height: 160px;
    box-sizing: border-box;
  }
  @media (max-width: 767px) {
    .skeleton-card {
      margin-left: 8px;
      margin-right: 8px;
    }
  }
  .shimmer {
    background: linear-gradient(
      90deg,
      var(--bg-secondary) 25%,
      var(--color-border) 37%,
      var(--bg-secondary) 63%
    );
    background-size: 400% 100%;
    animation: shimmer-anim 1.4s ease infinite;
    border-radius: var(--radius-sm);
  }
  @keyframes shimmer-anim {
    0% {
      background-position: 100% 50%;
    }
    100% {
      background-position: 0% 50%;
    }
  }
  .header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    height: 2.25rem;
  }
  .avatar {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .meta-col {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    flex: 1;
  }
  .title-line {
    height: 0.875rem;
    width: 45%;
  }
  .date-line {
    height: 0.625rem;
    width: 20%;
  }
  .category {
    height: 1.125rem;
    width: 4.5rem;
    border-radius: var(--radius-full);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }
  .body-line-1 {
    height: 0.75rem;
    width: 100%;
  }
  .body-line-2 {
    height: 0.75rem;
    width: 92%;
  }
  .body-line-3 {
    height: 0.75rem;
    width: 60%;
  }
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 0.75rem;
    border-top: 1px solid var(--color-border);
    margin-top: auto;
    height: 2rem;
  }
  .reactions-dock {
    display: flex;
    gap: 0.375rem;
    flex: 1;
  }
  .reaction-bubble {
    height: 1.375rem;
    width: 2.5rem;
    border-radius: var(--radius-md);
  }
  .meta-buttons {
    display: flex;
    gap: 0.5rem;
  }
  .meta-btn {
    height: 1.375rem;
    width: 3.5rem;
    border-radius: var(--radius-full);
  }
</style>
<div id="cards-container"></div>
`;

class SkeletonStories extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  static get observedAttributes() {
    return ['count'];
  }

  connectedCallback() {
    this._render();
  }

  attributeChangedCallback() {
    this._render();
  }

  _render() {
    const container = this.shadowRoot.getElementById('cards-container');
    if (!container) return;

    const countAttr = this.getAttribute('count');
    const count = countAttr ? parseInt(countAttr, 10) : 3;

    let cardsHtml = '';
    for (let i = 0; i < count; i++) {
      cardsHtml += `
        <div class="skeleton-card">
          <div class="header">
            <div class="avatar shimmer"></div>
            <div class="meta-col">
              <div class="title-line shimmer"></div>
              <div class="date-line shimmer"></div>
            </div>
            <div class="category shimmer"></div>
          </div>
          <div class="body">
            <div class="body-line-1 shimmer"></div>
            <div class="body-line-2 shimmer"></div>
            <div class="body-line-3 shimmer"></div>
          </div>
          <div class="footer">
            <div class="reactions-dock">
              <div class="reaction-bubble shimmer"></div>
              <div class="reaction-bubble shimmer"></div>
              <div class="reaction-bubble shimmer"></div>
            </div>
            <div class="meta-buttons">
              <div class="meta-btn shimmer"></div>
            </div>
          </div>
        </div>
      `;
    }
    container.innerHTML = cardsHtml;
  }
}

customElements.define('app-skeleton-stories', SkeletonStories);
