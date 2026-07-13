/**
 * Persistent Page Shell – eliminates full root wipes
 * Use this in every page's init function.
 */
export function createPageShell(rootId, shellHtml) {
  const root = document.getElementById(rootId);
  if (!root) return null;

  // If the shell doesn't exist, build it once.
  if (!root.querySelector('.page-shell')) {
    root.innerHTML = `<div class="page-shell">${shellHtml}</div>`;
  }

  const shell = root.querySelector('.page-shell');
  return {
    shell,
    getMount: (id) => shell.querySelector(`#${id}`),
    updateMount: (id, html) => {
      const mount = shell.querySelector(`#${id}`);
      if (mount) mount.innerHTML = html;
    },
    setContent: (html) => {
      const content = shell.querySelector('.page-content');
      if (content) content.innerHTML = html;
    },
    updateAll: (sections) => {
      Object.keys(sections).forEach((id) => {
        const mount = shell.querySelector(`#${id}`);
        if (mount) mount.innerHTML = sections[id];
      });
    }
  };
}
