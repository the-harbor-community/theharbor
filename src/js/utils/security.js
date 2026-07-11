/**
 * Ironclad Production Hardening & Anti-Exploit Security Utility
 * Blocking XSS, throttling inputs, caching Firebase transactions, protecting namespace.
 */

/**
 * Sanitizes an untrusted string to thoroughly block XSS, HTML/script injection vectors.
 * Converts special character symbols to their secure HTML entity equivalents.
 * @param {string} val 
 * @returns {string}
 */
export function sanitizeInput(val) {
  if (typeof val !== 'string') return '';
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .replace(/`/g, '&#x60;');
}

/**
 * Debounce a function to limit its execution frequency.
 * @param {Function} func 
 * @param {number} waitMs 
 * @returns {Function}
 */
export function debounce(func, waitMs) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), waitMs);
  };
}

/**
 * Throttle a function to run at most once in a given interval.
 * @param {Function} func 
 * @param {number} limitMs 
 * @returns {Function}
 */
export function throttle(func, limitMs) {
  let inThrottle = false;
  return function (...args) {
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limitMs);
    }
  };
}

/**
 * Defensive Client-Side Query Cache & Transaction Pooling
 * Prevents overlapping identical network requests and rate-limit saturation.
 */
const queryCache = new Map();
const activeRequests = new Map();

/**
 * Pool and cache asynchronous requests/fetches to prevent redundant Firebase or API transactions.
 * @param {string} cacheKey Unique cache key
 * @param {Function} fetchFn Function returning a promise with the raw data
 * @param {number} [ttlMs=5000] Time-to-live for cache in milliseconds
 * @returns {Promise<any>}
 */
export async function pooledQuery(cacheKey, fetchFn, ttlMs = 5000) {
  const now = Date.now();
  
  // 1. Check if we have a fresh cached result
  if (queryCache.has(cacheKey)) {
    const cached = queryCache.get(cacheKey);
    if (now - cached.timestamp < ttlMs) {
      return cached.data;
    } else {
      queryCache.delete(cacheKey);
    }
  }

  // 2. Check if there's already an active, ongoing request for this key
  if (activeRequests.has(cacheKey)) {
    return activeRequests.get(cacheKey);
  }

  // 3. Initiate the request, saving the promise in the active pool
  const promise = (async () => {
    try {
      const data = await fetchFn();
      queryCache.set(cacheKey, { timestamp: Date.now(), data });
      return data;
    } finally {
      activeRequests.delete(cacheKey);
    }
  })();

  activeRequests.set(cacheKey, promise);
  return promise;
}

/**
 * Clear the client-side query cache.
 */
export function clearQueryCache() {
  queryCache.clear();
  activeRequests.clear();
}
