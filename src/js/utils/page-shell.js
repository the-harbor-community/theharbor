/**
 * Persistent Page Shell Utility
 * Prevents full DOM wipes of #main-content when navigating to pages or updating states,
 * preserving existing components, focus, and typed states.
 */
export function createPageShell(shellId, htmlContent) {
  const main = document.getElementById('main-content');
  if (!main) return null;

  // Look for the existing shell container inside main
  let shellEl = main.querySelector(`#${shellId}`);
  if (!shellEl) {
    // If it doesn't exist, clear only if needed and create the container
    main.innerHTML = '';
    
    shellEl = document.createElement('div');
    shellEl.id = shellId;
    shellEl.className = 'page-shell-container w-full h-full';
    shellEl.innerHTML = htmlContent;
    
    main.appendChild(shellEl);
  }

  return shellEl;
}
