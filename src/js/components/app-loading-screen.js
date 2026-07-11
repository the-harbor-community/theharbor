const template = document.createElement('template');
template.innerHTML = `
<style>
  :host { display: block; }
  .screen {
    position: fixed; inset: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 1rem;
    background: var(--bg-primary); color: var(--text-primary); z-index: 9999;
  }
  :host([hidden]) .screen { display: none; }
  .icon { font-size: 2.5rem; animation: floatGentle 4s ease-in-out infinite; }
  .text { font-size: 0.625rem; font-weight: 900; letter-spacing: 0.15em; text-transform: uppercase; color: var(--color-primary); animation: pulse 2s infinite; }
  @keyframes floatGentle { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
</style>
<div class="screen">
  <div class="icon">⚓</div>
  <div class="text">Sailing into The Harbor...</div>
</div>
`;

class AppLoadingScreen extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }
  hide() {
    const screen = this.shadowRoot.querySelector('.screen');
    if (screen) {
      screen.style.transition = 'opacity 0.4s ease';
      screen.style.opacity = '0';
      screen.style.pointerEvents = 'none';
      setTimeout(() => {
        this.setAttribute('hidden', '');
      }, 400);
    } else {
      this.setAttribute('hidden', '');
    }
  }
}
customElements.define('app-loading-screen', AppLoadingScreen);
