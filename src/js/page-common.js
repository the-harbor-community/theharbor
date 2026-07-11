/**
 * Shared page shell HTML — included via copy in each .html file.
 * Bug report modal is inline in pages that need it.
 */

export const PAGE_SCRIPTS = `
  <script type="module" src="src/js/shell.js"></script>
`;

export function bugReportModalHTML() {
  return `
<div id="bug-report-modal" class="modal-backdrop" hidden role="dialog" aria-modal="true">
  <div class="card" style="max-width:24rem;width:100%;position:relative">
    <button id="bug-close" style="position:absolute;top:1rem;right:1rem;background:none;border:none;cursor:pointer;font-size:1.25rem" aria-label="Close">✕</button>
    <h2 style="font-size:1rem;font-weight:900;margin:0 0 1rem">🐛 Report a Bug</h2>
    <form id="bug-form">
      <label class="label">Issue Priority</label>
      <select id="bug-priority" class="select" style="margin-bottom:1rem">
        <option value="low">🟢 Low Priority</option>
        <option value="medium">🟡 Medium Priority</option>
        <option value="high">🔴 High Priority</option>
      </select>
      <label class="label">Description</label>
      <textarea id="bug-desc" class="textarea" rows="3" maxlength="1000" required placeholder="Tell us what is broken..." style="margin-bottom:1rem"></textarea>
      <button type="submit" class="btn btn--danger" style="width:100%">🚀 Submit Report</button>
    </form>
  </div>
</div>`;
}

export function initBugReport() {
  const modal = document.getElementById('bug-report-modal');
  if (!modal) return;
  document.getElementById('bug-close')?.addEventListener('click', () => modal.hidden = true);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
  document.getElementById('bug-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { getState, showToast } = await import(new URL('./store.js', import.meta.url).href);
    const { user } = getState();
    if (!user) return;
    const desc = document.getElementById('bug-desc').value.trim();
    if (desc.length < 5) { showToast('⚠️ Please write at least 5 characters.', 'warning'); return; }
    const { db } = await import(new URL('./firebase.js', import.meta.url).href);
    const { collection, addDoc } = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js');
    const { userData } = getState();
    try {
      await addDoc(collection(db, 'bugs'), {
        description: desc, priority: document.getElementById('bug-priority').value,
        status: 'pending', userId: user.uid, userName: userData?.name || 'Friend',
        userEmail: user.email || '', published: false, createdAt: new Date().toISOString(),
      });
      showToast('🐛 Bug report submitted! Thank you.', 'success');
      modal.hidden = true;
      document.getElementById('bug-desc').value = '';
    } catch (err) {
      showToast(`❌ ${err.message}`, 'error');
    }
  });
}
