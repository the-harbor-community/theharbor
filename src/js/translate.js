const cache = new Map();
const CACHE_TTL = 3600000;

export async function translateText(text, targetLang) {
  if (!text?.trim() || targetLang === 'en') return text;

  const cacheKey = `${targetLang}:${text.length}:${text.slice(0, 50)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached.result;

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const data = await res.json();
    const translated = data[0]?.map((s) => s[0]).join('') || text;
    cache.set(cacheKey, { result: translated, time: Date.now() });
    return translated;
  } catch {
    return text;
  }
}
