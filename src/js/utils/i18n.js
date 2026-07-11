/**
 * Centralized Lightweight Localization (i18n) Utility
 * 100% Dynamic Translation without hard reloading
 */

import { getState, subscribe } from '../store.js';
import { locales, localesLoadedPromise } from '../locales.js';

// Inverse lookup map for translating dynamically generated text nodes
const enValueToKey = new Map();

/**
 * Resolves a locale object safely. If the requested language key is missing,
 * forces a return of the 'en' object to prevent reference errors.
 * @param {string} langKey 
 * @returns {Object}
 */
export function initLocale(langKey) {
  let key = langKey;
  if (key === 'us' || key === 'en-US') key = 'en';
  if (!key || !locales[key]) {
    return locales['en'] || {};
  }
  return locales[key];
}

/**
 * Translate a key based on the current active language in store.
 * @param {string} key 
 * @param {string} [fallback] 
 * @returns {string}
 */
export function t(key, fallback) {
  const state = getState();
  const lang = state?.language || 'en';
  const loc = initLocale(lang);
  
  // Try current language
  let val = loc?.[key];
  if (val !== undefined && val !== null && String(val).trim() !== '') {
    return val;
  }
  
  // Try English fallback
  const enLoc = initLocale('en');
  val = enLoc?.[key];
  if (val !== undefined && val !== null && String(val).trim() !== '') {
    return val;
  }

  return fallback !== undefined ? fallback : key;
}

/**
 * Scan a DOM node (and its shadow roots) for text content and translate it instantly.
 * Supports deep recursive traversal and smart string matching to translate everything in place.
 * @param {HTMLElement|ShadowRoot} [root=document.body] 
 */
export function translatePage(root = document.body) {
  if (!root) return;

  const en = initLocale('en');

  // Build the reverse lookup map on the fly if needed
  if (enValueToKey.size === 0) {
    for (const [key, val] of Object.entries(en)) {
      if (typeof val === 'string' && val.trim()) {
        enValueToKey.set(val.trim().toLowerCase(), key);
      }
    }
  }

  function translateString(str) {
    if (!str) return str;
    const trimmed = str.trim();
    if (!trimmed) return str;

    // Direct match first
    let key = enValueToKey.get(trimmed.toLowerCase());
    if (key) return t(key);

    // Try matches after removing common prefix/suffix emojis or symbols
    const emojiRegex = /^([\s\u1F600-\u1F64F\u1F300-\u1F5FF\u1F680-\u1F6FF\u2600-\u26FF\u2700-\u27BF\u1F900-\u1F9FF\u1F1E0-\u1F1FF\u2300-\u23FF\u2B50\u2B06\u2190-\u21FF\u2705\u274C\u274E🚪⏳🔄🚨📝👤🤖🕊️🪙💬📌✏️🗑️⚠️🌐🔗🚀⚓🌊☀️🧭🛡️👑🔔🚪🚪📭🔧🎁🎈🎊🏆🔱]+)(.+)$/u;
    const matchEmoji = trimmed.match(emojiRegex);
    if (matchEmoji) {
      const prefix = matchEmoji[1];
      const rest = matchEmoji[2].trim();
      const restKey = enValueToKey.get(rest.toLowerCase());
      if (restKey) {
        return prefix + t(restKey);
      }
    }

    const matchSuffixEmoji = trimmed.match(/^(.+?)([\s\u1F600-\u1F64F\u1F300-\u1F5FF\u1F680-\u1F6FF\u2600-\u26FF\u2700-\u27BF\u1F900-\u1F9FF\u1F1E0-\u1F1FF\u2300-\u23FF\u2B50\u2B06\u2190-\u21FF\u2705\u274C\u274E🚪⏳🔄🚨📝👤🤖🕊️🪙💬📌✏️🗑️⚠️🌐🔗🚀⚓🌊☀️🧭🛡️👑🔔🚪🚪📭🔧🎁🎈🎊🏆🔱]+)$/u);
    if (matchSuffixEmoji) {
      const rest = matchSuffixEmoji[1].trim();
      const suffix = matchSuffixEmoji[2];
      const restKey = enValueToKey.get(rest.toLowerCase());
      if (restKey) {
        return t(restKey) + suffix;
      }
    }

    // Fallback: search key-value mapping directly
    for (const [k, v] of Object.entries(en)) {
      if (typeof v === 'string' && v.toLowerCase() === trimmed.toLowerCase()) {
        return t(k);
      }
    }

    return str;
  }

  function traverse(node) {
    // Translate text node
    if (node.nodeType === Node.TEXT_NODE) {
      if (node._originalText === undefined) {
        node._originalText = node.nodeValue;
      }
      const original = node._originalText;
      if (original && original.trim()) {
        const translated = translateString(original);
        if (translated !== node.nodeValue) {
          node.nodeValue = translated;
        }
      }
      return;
    }

    // If element, translate attributes and content
    if (node.nodeType === Node.ELEMENT_NODE) {
      // Avoid translating script, style, textarea, or code tags
      if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'TEXTAREA' || node.tagName === 'CODE') return;

      // Translate data-i18n first if exists
      const textKey = node.getAttribute('data-i18n');
      if (textKey) {
        node.textContent = t(textKey);
      }

      const placeholderKey = node.getAttribute('data-i18n-placeholder');
      if (placeholderKey) {
        node.setAttribute('placeholder', t(placeholderKey));
      } else if (node.hasAttribute('placeholder')) {
        if (node._originalPlaceholder === undefined) {
          node._originalPlaceholder = node.getAttribute('placeholder');
        }
        const ph = node._originalPlaceholder;
        const trans = translateString(ph);
        if (trans !== node.getAttribute('placeholder')) node.setAttribute('placeholder', trans);
      }

      const titleKey = node.getAttribute('data-i18n-title');
      if (titleKey) {
        node.setAttribute('title', t(titleKey));
      } else if (node.hasAttribute('title')) {
        if (node._originalTitle === undefined) {
          node._originalTitle = node.getAttribute('title');
        }
        const title = node._originalTitle;
        const trans = translateString(title);
        if (trans !== node.getAttribute('title')) node.setAttribute('title', trans);
      }

      if (node.hasAttribute('aria-label')) {
        if (node._originalAriaLabel === undefined) {
          node._originalAriaLabel = node.getAttribute('aria-label');
        }
        const al = node._originalAriaLabel;
        const trans = translateString(al);
        if (trans !== node.getAttribute('aria-label')) node.setAttribute('aria-label', trans);
      }

      // Special handling for input elements of type submit/button
      if (node.tagName === 'INPUT' && (node.type === 'button' || node.type === 'submit')) {
        if (node._originalValue === undefined) {
          node._originalValue = node.value;
        }
        const val = node._originalValue;
        const trans = translateString(val);
        if (trans !== node.value) node.value = trans;
      }

      // Check shadow root
      if (node.shadowRoot) {
        traverse(node.shadowRoot);
      }
    }

    // Traverse children
    let child = node.firstChild;
    while (child) {
      traverse(child);
      child = child.nextSibling;
    }
  }

  traverse(root);
}

// Automatically re-translate the entire viewport on language switches!
subscribe('language', () => {
  translatePage(document.body);
});

// Speculative execution guard: Wait for async fetch resolution, then build translation map and run first-pass translation
localesLoadedPromise.then(() => {
  enValueToKey.clear();
  translatePage(document.body);
});
