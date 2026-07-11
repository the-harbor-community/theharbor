import { showToast, showConfirm, t, getState } from '../store.js';
import { db } from '../firebase.js';
import { doc, getDoc, collection, addDoc, updateDoc, increment } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
// 🔥 Import the category helper
import { allowedStoryCategories } from '../utils.js';

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host { display: contents; }
  .backdrop { position: fixed; inset: 0; background: rgba(15,23,42,0.75); backdrop-filter: blur(6px); z-index: 280; display: flex; align-items: center; justify-content: center; padding: 1rem; }
  .backdrop[hidden] { display: none; }
  .modal { background: var(--color-card); border: 1px solid var(--color-border); border-radius: var(--radius-xl); padding: 1.5rem; max-width: 28rem; width: 100%; max-height: 90vh; overflow-y: auto; position: relative; }
  .close { position: absolute; top: 1rem; right: 1rem; background: none; border: none; cursor: pointer; color: var(--text-muted); }
  h2 { font-size: 1rem; font-weight: 900; margin: 0 0 1rem; }
  label { display: block; font-size: var(--text-xs); font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.25rem; }
  input, select, textarea { width: 100%; padding: 0.625rem; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--bg-secondary); color: var(--text-primary); font-family: inherit; font-size: var(--text-sm); margin-bottom: 0.75rem; }
  .save { width: 100%; padding: 0.75rem; border-radius: var(--radius-full); background: var(--color-primary); color: #fff; border: none; font-weight: 700; cursor: pointer; font-family: inherit; }
</style>
<div class="backdrop" hidden role="dialog" aria-modal="true" aria-label="Edit Story">
  <div class="modal">
    <button type="button" class="close" aria-label="Close">✕</button>
    <h2 id="modal-title">✏️ Edit Story</h2>
    <div id="form-area"><p>Loading...</p></div>
  </div>
</div>
`;

class AppEditStoryModal extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._storyId = null;
    this._version = 0;
    this._ownerId = null;
  }

  connectedCallback() {
    this.shadowRoot.querySelector('.close').addEventListener('click', () => this.close());
  }

  async open(storyId) {
    this._storyId = storyId;
    this.shadowRoot.querySelector('.backdrop').hidden = false;
    this.shadowRoot.getElementById('modal-title').textContent = `✏️ ${t('edit_story', 'Edit Story')}`;
    try {
      const snap = await getDoc(doc(db, 'stories', storyId));
      if (!snap.exists()) { showToast(t('story_not_found', 'Story not found.'), 'error'); this.close(); return; }
      const data = snap.data();
      const { user, userData } = getState();
      this._ownerId = data.userId;
      if (user?.uid !== data.userId) {
        showToast(t('admin_cannot_edit_story', 'Administrators cannot edit user story content.'), 'error');
        this.close();
        return;
      }
      this._version = data.version || 0;

      // 🔥 Build category options dynamically based on gender
      const gender = userData?.gender;
      const allowed = allowedStoryCategories(gender); // returns array of [value, labelKey]
      const allowedValues = allowed.map(([v]) => v);
      const currentCategory = data.category || 'struggles';

      // Label map (same as in submit.js)
      const labelMap = {
        men: `🧔 ${t('tab_men', "Man")}`,
        women: `👩 ${t('tab_women', 'Woman')}`,
        struggles: `🌊 ${t('tab_storm', 'Storm (Struggles)')}`,
        fun: `☀️ ${t('tab_sunny', 'Sunny (Fun/Encouragement)')}`,
        learning: `🧭 ${t('tab_compass', 'Compass (Lessons)')}`,
      };

      // Build option list: start with allowed categories
      let options = allowed.map(([value, key]) => {
        const label = labelMap[value] || key;
        const selected = value === currentCategory ? 'selected' : '';
        return `<option value="${value}" ${selected}>${label}</option>`;
      });

      // If the current category is NOT in the allowed list, add it as an extra option (preserve it)
      if (!allowedValues.includes(currentCategory)) {
        const label = labelMap[currentCategory] || currentCategory;
        options.unshift(`<option value="${currentCategory}" selected>${label} (current)</option>`);
      }

      const categoryOptions = options.join('');

      this.shadowRoot.getElementById('form-area').innerHTML = `
        <label>${t('title', 'Title')}</label><input id="title" value="${this._escape(data.title || '')}" maxlength="100">
        <label>${t('category', 'Category')}</label><select id="category">${categoryOptions}</select>
        <label>${t('content', 'Content')}</label><textarea id="content" rows="6" maxlength="5000">${this._escape(data.text || '')}</textarea>
        <button type="button" class="save" id="save">${t('save_changes', 'Save Changes')}</button>`;
      this.shadowRoot.getElementById('save').addEventListener('click', (e) => { e.preventDefault(); this._save(data); });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  close() { this.shadowRoot.querySelector('.backdrop').hidden = true; }

  _escape(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  _save(original) {
    const { user } = getState();
    if (user?.uid !== this._ownerId) {
      showToast(t('admin_cannot_edit_story', 'Administrators cannot edit user story content.'), 'error');
      return;
    }
    const title = this.shadowRoot.getElementById('title').value.trim();
    const text = this.shadowRoot.getElementById('content').value.trim();
    const category = this.shadowRoot.getElementById('category').value;
    if (title.length < 3 || text.length < 10) { showToast(t('title_content_required', 'Title and content are required.'), 'warning'); return; }
    showConfirm(t('save_changes', 'Save Changes'), t('save_story_confirm', 'Save your edits to this story?'), false, async () => {
      try {
        await addDoc(collection(db, 'stories', this._storyId, 'editHistory'), {
          title: original.title, text: original.text, category: original.category,
          editedAt: new Date().toISOString(), version: this._version,
        });
        await updateDoc(doc(db, 'stories', this._storyId), {
          title, text, category, version: increment(1), editCount: increment(1), updatedAt: serverTimestamp(),
        });
        showToast(t('story_updated', '✅ Story updated!'), 'success');
        this.close();
        window.dispatchEvent(new CustomEvent('story-updated', { detail: { storyId: this._storyId } }));
      } catch (err) { showToast(err.message, 'error'); }
    });
  }
}
customElements.define('app-edit-story-modal', AppEditStoryModal);