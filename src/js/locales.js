/**
 * Universal Host-Agnostic Locale Loader
 * Uses asynchronous fetch streams to resolve JSON MIME-type strictness.
 */

export const locales = {
  en: {},
  es: {},
  fr: {},
  ru: {},
  ja: {},
  ar: {},
  zh: {},
  bn: {}
};

// Asynchronous fetch queue utilizing relative location resolution
export const localesLoadedPromise = Promise.all(
  Object.keys(locales).map(async (lang) => {
    try {
      const url = `locales/${lang}.json`;
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      if (!res.ok) throw new Error(`HTTP error status: ${res.status}`);
      const data = await res.json();
      locales[lang] = data;
    } catch (err) {
      console.warn(`[i18n] Failed to fetch locale: ${lang}. Falling back to empty model.`, err);
    }
  })
).then(() => {
  window.dispatchEvent(new CustomEvent('harbor:locales-loaded'));
});
