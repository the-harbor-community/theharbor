/**
 * Safe local moderation regex and helper utilities.
 */
import { t } from '../store.js';

const VULGAR_PATTERNS = [
  /\bfuck[a-z]*\b/i,
  /\bshit[a-z]*\b/i,
  /\bbitch[a-z]*\b/i,
  /\basshole[a-z]*\b/i,
  /\bcunt[a-z]*\b/i,
  /\bbastard[a-z]*\b/i,
  /\bwhore[a-z]*\b/i,
  /\bidiot\b/i,
  /\bslut[a-z]*\b/i
];

/**
 * Checks if the given text contains any vulgar or blacklisted words.
 * @param {string} text 
 * @returns {boolean} True if vulgar words detected, false otherwise.
 */
export function checkVulgarWords(text) {
  if (!text || typeof text !== 'string') return false;
  const cleaned = text.toLowerCase();
  return VULGAR_PATTERNS.some(regex => regex.test(cleaned));
}

/**
 * Wraps vulgar words in styled span elements with line-through and coloring.
 */
export function highlightVulgarWords(escapedText) {
  if (!escapedText || typeof escapedText !== 'string') return escapedText;
  let highlighted = escapedText;
  VULGAR_PATTERNS.forEach(regex => {
    highlighted = highlighted.replace(new RegExp(regex.source, 'gi'), (match) => {
      return `<span class="vulgar-highlight" style="text-decoration: line-through red; text-decoration-color: red; color: #ef4444; font-weight: bold; background: rgba(239, 68, 68, 0.15); border-radius: 0.125rem; padding: 0 0.125rem;">${match}</span>`;
    });
  });
  return highlighted;
}

/**
 * Decorates an input or textarea element to highlight vulgar words in real-time as the user types.
 */
export function setupRealtimeInputHighlighting(inputEl) {
  if (!inputEl) return;
  if (inputEl.dataset.highlightingSet) return;
  inputEl.dataset.highlightingSet = 'true';

  const style = window.getComputedStyle(inputEl);
  
  const wrapper = document.createElement('div');
  wrapper.className = 'realtime-highlight-wrapper';
  wrapper.style.position = 'relative';
  wrapper.style.display = style.display === 'inline' || style.display === 'inline-block' ? 'inline-block' : 'block';
  wrapper.style.width = '100%';
  
  const backdrop = document.createElement('div');
  backdrop.className = 'realtime-highlight-backdrop';
  backdrop.style.position = 'absolute';
  backdrop.style.top = '0';
  backdrop.style.left = '0';
  backdrop.style.pointerEvents = 'none';
  backdrop.style.whiteSpace = inputEl.tagName === 'TEXTAREA' ? 'pre-wrap' : 'nowrap';
  backdrop.style.wordWrap = 'break-word';
  backdrop.style.overflow = 'hidden';
  backdrop.style.color = 'transparent';
  backdrop.style.boxSizing = 'border-box';
  backdrop.style.padding = style.padding;
  backdrop.style.font = style.font;
  backdrop.style.fontSize = style.fontSize;
  backdrop.style.fontFamily = style.fontFamily;
  backdrop.style.lineHeight = style.lineHeight;
  backdrop.style.letterSpacing = style.letterSpacing;
  backdrop.style.border = '1px solid transparent';
  backdrop.style.margin = style.margin;
  backdrop.style.textAlign = style.textAlign;
  
  inputEl.style.color = 'rgba(255, 255, 255, 0.85)';
  inputEl.style.caretColor = '#ffffff';
  
  inputEl.parentNode.insertBefore(wrapper, inputEl);
  wrapper.appendChild(backdrop);
  wrapper.appendChild(inputEl);
  
  const update = () => {
    const val = inputEl.value;
    const escaped = val
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    
    backdrop.innerHTML = highlightVulgarWords(escaped);
    
    backdrop.scrollTop = inputEl.scrollTop;
    backdrop.scrollLeft = inputEl.scrollLeft;
  };
  
  inputEl.addEventListener('input', update);
  inputEl.addEventListener('scroll', update);
  
  const observer = new ResizeObserver(() => {
    backdrop.style.width = `${inputEl.offsetWidth}px`;
    backdrop.style.height = `${inputEl.offsetHeight}px`;
  });
  observer.observe(inputEl);
  
  setTimeout(update, 50);
}
