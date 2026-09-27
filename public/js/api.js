// Thin fetch wrapper around the Express API with a per-URL cache for GETs,
// so switching profiles or reopening a title doesn't refetch.
//
// In static mode (the GitHub Pages build, marked by <html data-mode="static">)
// there is no server: reads come from pre-rendered JSON files, search runs in
// the browser, the contact form hands off to the visitor's email app, and
// analytics are skipped. All paths are relative so the site works under any
// base path (e.g. /repo-name/ on Pages).
const STATIC = document.documentElement.dataset.mode === 'static';
const cache = new Map();

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

async function request(url, options) {
  const res = await fetch(url, options);
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}

function get(url) {
  if (!cache.has(url)) {
    const pending = request(url).catch((err) => {
      cache.delete(url); // don't cache failures
      throw err;
    });
    cache.set(url, pending);
  }
  return cache.get(url);
}

function post(url, data) {
  return request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

const endpoint = (path) => (STATIC ? `api/${path}.json` : `api/${path}`);

// Mirrors server/catalog.js search(): every term must appear somewhere in the item.
async function staticSearch(query) {
  const { items } = await get(endpoint('search'));
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = terms.length === 0 ? [] : items.filter((item) => {
    const haystack = [
      item.title, item.subtitle, item.summary, item.period,
      ...(item.bullets ?? []), ...(item.tags ?? []), ...(item.genres ?? []),
    ].join(' ').toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  return { query, results };
}

async function emailContact(data) {
  const { owner } = await api.profiles();
  const subject = `Portfolio message from ${data.name}${data.company ? ` (${data.company})` : ''}`;
  const body = `${data.message}\n\n${data.name}\n${data.email}`;
  location.href = `mailto:${owner.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { via: 'email' };
}

export const api = {
  isStatic: STATIC,
  profiles: () => get(endpoint('profiles')),
  browse: (profileId) => get(endpoint(`browse/${encodeURIComponent(profileId)}`)),
  item: (id) => get(endpoint(`items/${encodeURIComponent(id)}`)),
  search: (q) => (STATIC ? staticSearch(q) : request(`api/search?q=${encodeURIComponent(q)}`)),
  contact: (data) => (STATIC ? emailContact(data) : post('api/contact', data)),
  // Analytics must never break the UI.
  track: (event, target) => (STATIC ? Promise.resolve() : post('api/track', { event, target }).catch(() => {})),
};
