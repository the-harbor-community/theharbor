const template = document.createElement('template');
template.innerHTML = `
<style>
  :host { position: fixed; inset: 0; pointer-events: none; z-index: 9999; overflow: hidden; }
  .emoji {
    position: absolute; font-size: 1.75rem;
    animation: floatUp 1.8s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    pointer-events: none; will-change: transform, opacity;
  }
  @keyframes floatUp {
    0% { opacity: 1; transform: translateY(0) scale(0.8) rotate(0deg); }
    40% { opacity: 1; transform: translateY(-30px) scale(1.2) rotate(8deg); }
    100% { opacity: 0; transform: translateY(-100px) scale(1.5) rotate(-5deg); }
  }
</style>
<div id="container"></div>
`;

class AppFloatingEmojis extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }
  connectedCallback() {
    window.addEventListener('floating-emoji', (e) => {
      const { emoji, x, y } = e.detail;
      const el = document.createElement('div');
      el.className = 'emoji';
      el.textContent = emoji;
      el.style.left = `${(x ?? window.innerWidth / 2) - 12 + (Math.random() * 24 - 12)}px`;
      el.style.top = `${(y ?? window.innerHeight / 2) - 12}px`;
      this.shadowRoot.getElementById('container').appendChild(el);
      setTimeout(() => el.remove(), 1800);
    });
  }
}
customElements.define('app-floating-emojis', AppFloatingEmojis);
