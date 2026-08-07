// ─────────────────────────────────────────────────────────────────────────────
// Service worker: keep the directory usable with no signal.
//
// The motivating case is specific. Someone is in a hospital — a basement
// corridor, a lift lobby, a ward with one bar — and wants to know where the
// nearest kosher grocery is, or when Shabbos comes in. They loaded the app in
// the lobby twenty minutes ago. Without this, they get a browser error page;
// with it, they get the listings they already had.
//
// Three strategies, chosen per request type:
//
//   Static assets (/_next/static/*)  cache-first. Content-hashed filenames, so
//                                    a cached copy can never be wrong.
//   Optimized images (/_next/image)  cache-first, capped. Same reasoning; the
//                                    URL carries the exact size and quality.
//   Pages and content APIs           network-first, falling back to cache.
//                                    Fresh whenever there's signal — a stale
//                                    "open now" badge is worse than a slow
//                                    one — and the last good copy otherwise.
//
// What is deliberately NEVER cached is as important as what is: see
// isCacheable. Anything under /admin, /inbox or their APIs holds submitted
// personal details — names and phone numbers of people asking for help — and
// must not be written to disk on whatever device happened to open it.
// ─────────────────────────────────────────────────────────────────────────────

// Bump to invalidate everything: old caches are deleted on activate.
const VERSION = 'v1'
const STATIC_CACHE = `jpc-static-${VERSION}`
const CONTENT_CACHE = `jpc-content-${VERSION}`
const IMAGE_CACHE = `jpc-images-${VERSION}`
const ALL_CACHES = [STATIC_CACHE, CONTENT_CACHE, IMAGE_CACHE]

// Keeps the image cache from growing without limit on a phone.
const IMAGE_CACHE_LIMIT = 60

const OFFLINE_URL = '/offline'

self.addEventListener('install', (event) => {
  // Pre-cache only the offline page. Everything else is cached as it's used —
  // pre-caching a directory we don't know the visitor wants would spend their
  // data on their first visit to save time on a visit they may never make.
  event.waitUntil(
    caches
      .open(CONTENT_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .catch(() => {
        // A missing offline page must not abort the install — the rest of the
        // worker is still worth having.
      })
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('jpc-') && !ALL_CACHES.includes(k)).map((k) => caches.delete(k))),
      )
      // Take over open tabs immediately rather than waiting for them to close,
      // so a fixed worker actually reaches the person who hit the bug.
      .then(() => self.clients.claim()),
  )
})

/** Paths whose responses must never touch the cache. */
function isCacheable(url) {
  // Only this origin. A cross-origin response is someone else's to cache.
  if (url.origin !== self.location.origin) return false

  const p = url.pathname
  // Anything that can contain a person's submitted details, or an admin's
  // view of them. This is the rule that matters most in this file.
  if (p.startsWith('/admin') || p.startsWith('/inbox')) return false
  if (p.startsWith('/api/admin') || p.startsWith('/api/inbox')) return false
  // Write endpoints and one-off lookups — nothing here is worth replaying.
  if (p.startsWith('/api/submissions') || p.startsWith('/api/requests')) return false
  if (p.startsWith('/api/votes') || p.startsWith('/api/search-miss')) return false
  return true
}

/** The read-only content APIs worth having offline. */
function isContentApi(pathname) {
  return [
    '/api/resources',
    '/api/categories',
    '/api/site-settings',
    '/api/home-sections',
    '/api/forms',
    '/api/hospitals',
    '/api/communities',
    '/api/zmanim',
  ].some((p) => pathname === p || pathname.startsWith(`${p}?`))
}

/** Trims a cache to `limit` entries, oldest first. */
async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= limit) return
  await Promise.all(keys.slice(0, keys.length - limit).map((k) => cache.delete(k)))
}

async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit

  const response = await fetch(request)
  // Only store a real success. An error page cached under an asset URL would
  // persist the failure long after the network recovered.
  if (response.ok) {
    await cache.put(request, response.clone())
    if (limit) trimCache(cacheName, limit)
  }
  return response
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch (err) {
    const hit = await cache.match(request)
    if (hit) return hit
    // A navigation with nothing cached is the one case worth a bespoke page,
    // so the visitor sees an explanation rather than the browser's dinosaur.
    if (request.mode === 'navigate') {
      const offline = await cache.match(OFFLINE_URL)
      if (offline) return offline
    }
    throw err
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only GET. A POST is an action, not a document — replaying one from cache
  // would mean re-submitting somebody's form.
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (!isCacheable(url)) return

  // An authenticated request is per-person by definition; never store it.
  if (request.headers.has('authorization')) return

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
    return
  }

  if (url.pathname.startsWith('/_next/image')) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, IMAGE_CACHE_LIMIT))
    return
  }

  if (request.mode === 'navigate' || isContentApi(url.pathname)) {
    event.respondWith(networkFirst(request, CONTENT_CACHE))
  }
})

// Lets the page ask a newly-installed worker to take over without a reload.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})
