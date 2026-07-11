import { subscribe, getState, removeToast } from '../store.js';

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host { position: fixed; bottom: 1rem; right: 1rem; z-index: 300; display: flex; flex-direction: column; gap: 0.5rem; pointer-events: none; }
  .toast {
    padding: 0.75rem 1rem; border-radius: var(--radius-lg); font-size: var(--text-sm); font-weight: 600;
    box-shadow: var(--shadow-lg); pointer-events: auto; animation: slideDown 0.2s forwards; max-width: 20rem;
  }
  .toast--success { background: var(--color-success); color: #fff; }
  .toast--warning { background: var(--color-warning); color: #fff; }
  .toast--error { background: var(--color-danger); color: #fff; }
  .toast--info { background: var(--color-secondary); color: #fff; }
  @keyframes slideDown { from{transform:translateY(-12px);opacity:0} to{transform:translateY(0);opacity:1} }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-6px); }
    40%, 80% { transform: translateX(6px); }
  }
  .toast--shake {
    animation: shake 0.4s ease-in-out !important;
  }
</style>
<div id="container"></div>
`;

class AppToastHost extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }
  connectedCallback() {
    subscribe('toasts', () => this._render());
    subscribe('user', () => this._render());
  }
  _render() {
    const { toasts, user } = getState();
    const container = this.shadowRoot.getElementById('container');
    if (!user) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = toasts.map(t =>
      `<div class="toast toast--${t.type} ${t.shake ? 'toast--shake' : ''}" data-id="${t.id}">${t.message}</div>`
    ).join('');
  }
}
customElements.define('app-toast-host', AppToastHost);
