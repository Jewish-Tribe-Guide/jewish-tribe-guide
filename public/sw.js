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
//   Static assets (/_next/static/*)  cache-first, capped. Content-hashed
//                                    filenames, so a cached copy can never be
//                                    wrong.
//   Optimized images (/_next/image)  cache-first, capped. Same reasoning; the
//                                    URL carries the exact size and quality.
//   Pages and content APIs           network-first, falling back to cache.
//                                    Fresh whenever there's signal — a stale
//                                    "open now" badge is worse than a slow
//                                    one — and the last good copy otherwise.
//                                    A page that hasn't answered in a few
//                                    seconds gets its saved copy instead.
//
// What is deliberately NEVER cached is as important as what is: see
// isCacheable. Anything under /admin, /inbox or their APIs holds submitted
// personal details — names and phone numbers of people asking for help — and
// must not be written to disk on whatever device happened to open it.
//
// Every copy is stored after the response has gone to the page (waitUntil),
// never before: storing reads the whole body, and waiting on it held every
// page back until its last byte had arrived and been written (Nov 18).
// ─────────────────────────────────────────────────────────────────────────────

// Bump to invalidate everything: old caches are deleted on activate.
const VERSION = 'v1'
const STATIC_CACHE = `jpc-static-${VERSION}`
const CONTENT_CACHE = `jpc-content-${VERSION}`
const IMAGE_CACHE = `jpc-images-${VERSION}`
const ALL_CACHES = [STATIC_CACHE, CONTENT_CACHE, IMAGE_CACHE]

// Keeps the image cache from growing without limit on a phone.
const IMAGE_CACHE_LIMIT = 60

// The same for pages and content APIs. Nothing bounded this: every distinct
// URL a visitor opened — including each combination of map filters and search
// text, since those live in the query string — was kept forever. The limit is
// generous for a real visit (a dozen categories, the map, a few forms, and the
// content APIs that back them) and small next to what a phone can spare.
const CONTENT_CACHE_LIMIT = 60

// And for scripts. Each deploy names its changed scripts anew, and nothing
// ever removed the old ones, so the cache grew with every deploy (Nov 18).
// Oldest stored first: a script still in use that goes is fetched and stored
// again on the next page that needs it. Several deploys' worth.
const STATIC_CACHE_LIMIT = 300

// How long a page may take before its saved copy is shown instead. On one bar
// a request can hang for a minute; the saved copy is what the visitor came
// for (Nov 18). The request carries on and stores the fresh page.
const NAVIGATION_TIMEOUT_MS = 4000

// A page reached by a tap rather than loaded whole is stored by the worker
// itself (see 'message'), unless a copy younger than this is already saved.
const TAPPED_PAGE_FRESH_MS = 6 * 60 * 60 * 1000

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

/** Trims a cache to `limit` entries, oldest first. Entries whose path is in
 *  `keep` are never evicted and don't count against the limit — the offline
 *  page is the one thing the cache must always be able to answer with. */
async function trimCache(cacheName, limit, keep = []) {
  const cache = await caches.open(cacheName)
  const evictable = (await cache.keys()).filter((k) => !keep.includes(new URL(k.url).pathname))
  if (evictable.length <= limit) return
  await Promise.all(evictable.slice(0, evictable.length - limit).map((k) => cache.delete(k)))
}

/** Stores a copy, last in the eviction order, then trims the cache. Delete
 *  first so a refreshed URL moves to the back of the queue (put keeps an
 *  existing entry's original position), which is what makes "oldest first"
 *  mean least recently loaded rather than first ever seen. */
async function store(cacheName, request, response, limit, keep) {
  const cache = await caches.open(cacheName)
  await cache.delete(request)
  await cache.put(request, response)
  if (limit) await trimCache(cacheName, limit, keep)
}

function cacheFirst(event, cacheName, limit) {
  const { request } = event
  return caches
    .open(cacheName)
    .then((cache) => cache.match(request))
    .then((hit) => {
      if (hit) return hit
      return fetch(request).then((response) => {
        // Only store a real success. An error page cached under an asset URL
        // would persist the failure long after the network recovered.
        if (response.ok) event.waitUntil(store(cacheName, request, response.clone(), limit).catch(() => {}))
        return response
      })
    })
}

/** A single-segment path is a community's home ("/philly"); "/offline" is
 *  the only other page at the root that the worker stores. */
function isCommunityHome(pathname) {
  return /^\/[a-z0-9-]+$/.test(pathname) && pathname !== OFFLINE_URL
}

/** With no signal: the saved copy, or for a page with none, the offline page.
 *  "/" is a redirect, which is never stored, so opening the installed app
 *  with no signal always showed the offline page (Nov 18): it gets the
 *  community home visited last instead. */
async function savedCopy(request) {
  const cache = await caches.open(CONTENT_CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  if (request.mode !== 'navigate') return undefined
  // A tapped page is saved without its query string (storeTappedPage), and
  // the page reads its query itself: "?item=…" still opens that listing.
  const samePage = await cache.match(request, { ignoreSearch: true })
  if (samePage) return samePage
  if (new URL(request.url).pathname === '/') {
    const homes = (await cache.keys()).filter((k) => isCommunityHome(new URL(k.url).pathname))
    if (homes.length > 0) {
      const home = await cache.match(homes[homes.length - 1])
      if (home) return home
    }
  }
  // A navigation with nothing cached is the one case worth a bespoke page,
  // so the visitor sees an explanation rather than the browser's dinosaur.
  return cache.match(OFFLINE_URL)
}

function networkFirst(event) {
  const { request } = event
  const network = fetch(request)
  // Stored after the page has its response; see the top of this file. The
  // copy is made now, before the page starts reading the body.
  event.waitUntil(
    network
      .then((response) => (response.ok ? store(CONTENT_CACHE, request, response.clone(), CONTENT_CACHE_LIMIT, [OFFLINE_URL]) : undefined))
      .catch(() => {}),
  )

  const fallBack = (err) =>
    savedCopy(request).then((copy) => {
      if (copy) return copy
      throw err
    })

  if (request.mode !== 'navigate') return network.catch(fallBack)

  // A page that hasn't answered in NAVIGATION_TIMEOUT_MS: its saved copy, if
  // there is one. With none, keep waiting on the network.
  return new Promise((resolve, reject) => {
    let answered = false
    const timer = setTimeout(() => {
      caches
        .open(CONTENT_CACHE)
        .then((cache) => cache.match(request))
        .then((copy) => {
          if (copy && !answered) {
            answered = true
            resolve(copy)
          }
        })
        .catch(() => {})
    }, NAVIGATION_TIMEOUT_MS)
    network.then(
      (response) => {
        clearTimeout(timer)
        if (answered) return
        answered = true
        resolve(response)
      },
      (err) => {
        clearTimeout(timer)
        if (answered) return
        answered = true
        fallBack(err).then(resolve, reject)
      },
    )
  })
}

/** Stores a page the visitor reached by a tap. A tap fetches the page's data,
 *  never its HTML, so before this the only pages there with no signal were
 *  ones loaded whole (Nov 18). Fetched once, then again only once the saved
 *  copy is older than TAPPED_PAGE_FRESH_MS, and not at all with Data Saver
 *  on. */
async function storeTappedPage(path) {
  const url = new URL(path, self.location.origin)
  if (!isCacheable(url)) return
  if (self.navigator && self.navigator.connection && self.navigator.connection.saveData) return
  const cache = await caches.open(CONTENT_CACHE)
  const saved = await cache.match(url.href)
  const savedAt = saved && saved.headers ? Date.parse(saved.headers.get('date') || '') : NaN
  if (saved && Date.now() - savedAt < TAPPED_PAGE_FRESH_MS) return
  const response = await fetch(url.href, { credentials: 'same-origin', headers: { accept: 'text/html' } })
  const type = (response.headers && response.headers.get('content-type')) || ''
  if (!response.ok || !type.includes('text/html')) return
  await store(CONTENT_CACHE, url.href, response, CONTENT_CACHE_LIMIT, [OFFLINE_URL])
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
    event.respondWith(cacheFirst(event, STATIC_CACHE, STATIC_CACHE_LIMIT))
    return
  }

  if (url.pathname.startsWith('/_next/image')) {
    event.respondWith(cacheFirst(event, IMAGE_CACHE, IMAGE_CACHE_LIMIT))
    return
  }

  if (request.mode === 'navigate' || isContentApi(url.pathname)) {
    event.respondWith(networkFirst(event))
  }
})

self.addEventListener('message', (event) => {
  // Lets the page ask a newly-installed worker to take over without a reload.
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
  // A page reached by a tap (ServiceWorker.tsx).
  if (event.data && event.data.type === 'STORE_PAGE' && typeof event.data.path === 'string') {
    event.waitUntil(storeTappedPage(event.data.path).catch(() => {}))
  }
})
