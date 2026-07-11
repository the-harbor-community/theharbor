import { subscribe, getState, closeConfirm, t } from '../store.js';

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host { display: contents; }
  .backdrop {
    position: fixed; inset: 0; background: rgba(5, 10, 10, 0.85);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); z-index: 290;
    display: flex; align-items: center; justify-content: center;
    padding: 1.5rem;
    transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .backdrop[hidden] { display: none; }
  .modal {
    background: rgba(18, 30, 30, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 20px 50px rgba(0,0,0,0.7), 0 0 20px rgba(26, 74, 74, 0.4);
    border-radius: 1.25rem; padding: 2rem;
    max-width: 24rem; width: 100%; position: relative;
    color: #fff;
    animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.95) translateY(10px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
  .close {
    position: absolute; top: 1.25rem; right: 1.25rem;
    background: none; border: none; cursor: pointer;
    color: #a3a3a3; font-size: 1.1rem;
    transition: color 0.15s;
  }
  .close:hover { color: #fff; }
  h2 {
    font-size: 1.125rem; font-weight: 900; margin: 0 0 0.75rem;
    color: #fff;
  }
  .message {
    font-size: 0.875rem;
    color: #d4d4d4;
    margin: 0 0 1.25rem;
    line-height: 1.6;
  }
  .message > * { margin: 0; }
  textarea {
    width: 100%; padding: 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.75rem;
    background: rgba(255, 255, 255, 0.03);
    color: #fff;
    font-family: inherit; font-size: 0.875rem;
    margin-bottom: 1.25rem;
    outline: none;
    box-sizing: border-box;
  }
  textarea:focus {
    border-color: #fbbf24;
    background: rgba(255, 255, 255, 0.05);
  }
  .actions {
    display: flex; gap: 0.75rem;
    justify-content: flex-end;
  }
  .actions .ok:only-child {
    flex: 1;
  }
  button {
    padding: 0.75rem 1.5rem;
    border-radius: 9999px;
    font-weight: 800;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.8125rem;
    border: none;
    transition: all 0.2s;
  }
  .cancel {
    background: rgba(255, 255, 255, 0.05);
    color: #d4d4d4;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .cancel:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
  .ok {
    background: linear-gradient(135deg, #1a4a4a 0%, #113131 100%);
    border: 1px solid #1a4a4a;
    color: #fff;
  }
  .ok:hover {
    border-color: #fbbf24;
    transform: translateY(-1px);
  }
</style>
<div class="backdrop" hidden role="dialog" aria-modal="true">
  <div class="modal">
    <button class="close" aria-label="Close">✕</button>
    <h2 id="title"></h2>
    <div class="message" id="message"></div>
    <textarea id="input" hidden rows="3" placeholder="Type here..."></textarea>
    <div class="actions">
      <button class="cancel" id="cancel"></button>
      <button class="ok" id="ok"></button>
    </div>
  </div>
</div>
`;

class AppConfirmModal extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    this.shadowRoot.querySelector('.close').addEventListener('click', closeConfirm);
    this.shadowRoot.getElementById('cancel').addEventListener('click', closeConfirm);
    this.shadowRoot.getElementById('ok').addEventListener('click', () => this._handleOk());
    subscribe('confirmModal', () => this._render());
  }

  _render() {
    const { confirmModal } = getState();
    const backdrop = this.shadowRoot.querySelector('.backdrop');
    if (!confirmModal.isOpen) {
      backdrop.hidden = true;
      return;
    }
    backdrop.hidden = false;

    const { title, message, requireInput, confirmText, cancelText } = confirmModal;

    this.shadowRoot.getElementById('title').textContent = `⚠️ ${title}`;
    // 🔥 CRITICAL: Use innerHTML to render styled content
    this.shadowRoot.getElementById('message').innerHTML = message;

    const input = this.shadowRoot.getElementById('input');
    input.hidden = !requireInput;
    input.value = '';

    const cancelBtn = this.shadowRoot.getElementById('cancel');
    if (cancelText === null || cancelText === '') {
      cancelBtn.style.display = 'none';
    } else {
      cancelBtn.style.display = '';
      cancelBtn.textContent = cancelText;
    }

    this.shadowRoot.getElementById('ok').textContent = confirmText;
  }

  _handleOk() {
    const { confirmModal } = getState();
    const input = this.shadowRoot.getElementById('input');
    if (confirmModal.requireInput && input.value.trim().length < 3) return;
    confirmModal.callback(confirmModal.requireInput ? input.value.trim() : undefined);
    closeConfirm();
  }
}

customElements.define('app-confirm-modal', AppConfirmModal);