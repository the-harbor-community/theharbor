import { getState, showToast, showConfirm, t, patchUserData } from '../store.js';
import { playCoinClink } from '../audio.js';
import { db, resolveAuthorId, increment } from '../firebase.js';
import { doc, runTransaction, collection, addDoc } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host { display: contents; }
  .backdrop { position: fixed; inset: 0; background: rgba(15,23,42,0.75); backdrop-filter: blur(6px); z-index: 270; display: flex; align-items: center; justify-content: center; padding: 1rem; }
  .backdrop[hidden] { display: none; }
  .modal { background: var(--color-card); border: 1px solid var(--color-border); border-radius: var(--radius-xl); padding: 1.5rem; max-width: 22rem; width: 100%; position: relative; }
  .close { position: absolute; top: 1rem; right: 1rem; background: none; border: none; cursor: pointer; color: var(--text-muted); }
  h2 { font-size: 1rem; font-weight: 900; margin: 0 0 0.75rem; }
  .balance { background: linear-gradient(135deg,rgba(245,158,11,0.1),rgba(251,191,36,0.1)); border: 1px solid rgba(245,158,11,0.3); border-radius: var(--radius-xl); padding: 0.75rem; margin-bottom: 1rem; text-align: center; }
  .grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 0.5rem; margin-bottom: 1rem; }
  .amt { padding: 0.75rem; border-radius: var(--radius-lg); border: 1px solid var(--color-border); background: var(--bg-secondary); cursor: pointer; font-weight: 700; font-family: inherit; font-size: var(--text-sm); }
  .amt.selected { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
  input, textarea { width: 100%; padding: 0.625rem; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--bg-secondary); color: var(--text-primary); font-family: inherit; font-size: var(--text-sm); margin-bottom: 0.75rem; }
  .send { width: 100%; padding: 0.75rem; border-radius: var(--radius-full); background: linear-gradient(to right,#eab308,#f59e0b); color: #fff; border: none; font-weight: 900; cursor: pointer; font-family: inherit; }
</style>
<div class="backdrop" hidden role="dialog" aria-modal="true" aria-label="Donate Gold">
  <div class="modal">
    <button class="close" aria-label="Close">✕</button>
    <h2>🪙 Donate Gold</h2>
    <div class="balance">Your Balance: <strong id="balance">0</strong> 🪙</div>
    <div class="grid" id="amounts"></div>
    <input type="number" id="custom" placeholder="Custom amount (max 100)" min="1" max="100">
    <textarea id="message" rows="2" placeholder="Optional message..." maxlength="200"></textarea>
    <button class="send" id="send">🚀 Send Gold</button>
  </div>
</div>
`;

class AppGoldModal extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._storyId = null;
    this._amount = 5;
  }
  connectedCallback() {
    this.shadowRoot.querySelector('.close').addEventListener('click', () => this.close());
    this.shadowRoot.getElementById('send').addEventListener('click', () => this._send());
    [1, 5, 10, 25, 50, 100].forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'amt' + (a === 5 ? ' selected' : '');
      btn.textContent = `🪙 ${a}`;
      btn.addEventListener('click', () => {
        this._amount = a;
        this.shadowRoot.querySelectorAll('.amt').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.shadowRoot.getElementById('custom').value = '';
      });
      this.shadowRoot.getElementById('amounts').appendChild(btn);
    });
    this.shadowRoot.getElementById('custom').addEventListener('input', (e) => {
      this._amount = parseInt(e.target.value, 10) || 0;
      this.shadowRoot.querySelectorAll('.amt').forEach(b => b.classList.remove('selected'));
    });
  }
  open(storyId, isComment = false) {
    this._storyId = storyId;
    this._isComment = isComment;
    const { userData } = getState();
    const balanceEl = this.shadowRoot.getElementById('balance');
    if (balanceEl) balanceEl.textContent = String(userData?.goldBalance || 0);
    const titleEl = this.shadowRoot.querySelector('h2');
    if (titleEl) {
      titleEl.innerHTML = isComment ? '🪙 Donate Gold (Comment)' : '🪙 Donate Gold';
    }
    const backdrop = this.shadowRoot.querySelector('.backdrop');
    if (backdrop) backdrop.hidden = false;
  }
  close() { this.shadowRoot.querySelector('.backdrop').hidden = true; }

  _send() {
    const { user, userData } = getState();
    const amount = this._amount;
    if (!amount || amount < 1) { showToast('Enter a valid amount.', 'warning'); return; }
    if ((userData?.goldBalance || 0) < amount) { showToast('Insufficient gold balance.', 'warning'); return; }
    const confirmMsg = this._isComment
      ? `Send ${amount} 🪙 gold to this comment?`
      : `Send ${amount} 🪙 gold to this story?`;
    showConfirm('Donate Gold', confirmMsg, false, async () => {
      let recipientAuthorId = '';
      let recipientName = 'Someone';
      try {
        await runTransaction(db, async (tx) => {
          const storyRef = doc(db, 'stories', this._storyId);
          const storySnap = await tx.get(storyRef);
          if (!storySnap.exists()) throw new Error('Story not found');
          const story = storySnap.data();
          const authorId = resolveAuthorId(story);
          recipientAuthorId = authorId;
          if (!authorId) throw new Error('Story author not found');
          const senderRef = doc(db, 'users', user.uid);
          const recipientRef = doc(db, 'users', authorId);
          const senderSnap = await tx.get(senderRef);
          if ((senderSnap.data()?.goldBalance || 0) < amount) throw new Error('Insufficient balance');
          
          const recipientSnap = await tx.get(recipientRef);
          recipientName = recipientSnap.data()?.name || 'Someone';

          tx.update(senderRef, { goldBalance: increment(-amount), goldGiven: increment(amount) });
          tx.update(recipientRef, { goldReceived: increment(amount) });
          tx.update(storyRef, { goldReceived: increment(amount), totalGold: increment(amount) });
          
          if (authorId !== user.uid) {
            tx.set(doc(collection(db, 'notifications')), {
              toUid: authorId, fromUid: user.uid, fromName: userData?.name || 'Someone',
              type: 'gold', data: { storyId: this._storyId, amount }, read: false,
              createdAt: new Date().toISOString(),
            });
          }
        });

        await addDoc(collection(db, 'goldTransactions'), {
          fromUid: user.uid,
          toUid: recipientAuthorId,
          authorId: recipientAuthorId,
          userId: recipientAuthorId,
          storyId: this._storyId,
          amount,
          message: this.shadowRoot.getElementById('message')?.value?.trim() || '',
          fromName: userData?.name || 'Someone',
          toName: recipientName,
          displayText: `You send ${amount} gold to ${recipientName}`,
          createdAt: new Date().toISOString(),
        });

        patchUserData({
          goldBalance: Math.max((userData?.goldBalance || 0) - amount, 0),
          goldGiven: (userData?.goldGiven || 0) + amount,
        });
        window.dispatchEvent(new CustomEvent('gold-donated', {
          detail: { storyId: this._storyId, amount, authorId: recipientAuthorId, toUid: recipientAuthorId },
        }));
        playCoinClink();
        showToast(`🪙 Sent ${amount} gold!`, 'success');
        this.close();
      } catch (err) {
        showToast(`❌ ${err.message}`, 'error');
      }
    });
  }
}
customElements.define('app-gold-modal', AppGoldModal);
