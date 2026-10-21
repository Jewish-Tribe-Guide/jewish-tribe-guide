import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { ITEM_NAMES, itemName, itemWords } from './itemNames'
import { words } from './ask'
import { addedItemName, cleanItemName } from './itemMarks'
import { DEFAULT_READER_MODEL } from './readQuestion'
import { WATCH_FETCH_HEADERS } from './websiteWatch'

// ── Reading a food place's main dishes off its own menu (agreed Oct 1) ───────
// On the admin's "Main dishes" tab, once per place, on demand: the server
// fetches the place's own website, finds its menu page or PDF, and the AI
// picks up to ten main dishes from it, each with the menu's own words it
// read it from. Nothing shows until an admin approves it.
//
// The AI reads; it never supplies a fact. Each dish has to come with the
// line it was read from, and a line that isn't on the page we fetched means
// the dish is dropped, not shown: a dish the menu doesn't name never reaches
// the admin. A PDF goes to the AI as a file, where there's no text here to
// check against: those dishes say so, and the admin opens the menu.
//
// Only ever the listing's own website, fetched from the server: never an
// address on a private network (the server's own neighbours), never more
// than a few hops of redirects, a few seconds, or a couple of megabytes.

export const MAX_DISHES = 10
const FETCH_TIMEOUT_MS = 8_000
const MAX_BYTES = 3_000_000
const MAX_REDIRECTS = 4
/** What the AI is shown of a page: menus are long, and the dishes are in
 *  the first part of most. */
const MAX_TEXT = 24_000

export type MenuDish = {
  name: string
  /** The menu's own words it was read from. */
  quote: string
  /** Whether those words were found on the page we fetched. False for a
   *  PDF, which the AI read as a file, and for a picture. */
  checked: boolean
  /** Whether those words name the dish ("Classic Burger" for Burgers), not
   *  only a line near it ("Sandwich" for Falafel): the admin looks twice
   *  at one that doesn't. */
  named?: boolean
  /** Read from a picture of the menu on its page (menuPictures). */
  picture?: true
}

export type MenuReading = {
  /** The page or PDF the dishes were read from. */
  sourceUrl: string | null
  dishes: MenuDish[]
  /** Why there are none, when there are none. */
  note: string | null
}

// ── Fetching, safely ─────────────────────────────────────────────────────────

/** Addresses that aren't the public internet: loopback, private ranges,
 *  link-local (cloud metadata lives there), carrier NAT, multicast and the
 *  like. A listing's website is typed by the public, so it could name any
 *  of them. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    )
  }
  if (v === 6) {
    const s = ip.toLowerCase()
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s)
    if (mapped) return isPrivateAddress(mapped[1])
    return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s)
  }
  return true
}

export type Lookup = (host: string) => Promise<string[]>
export const dnsLookup: Lookup = async (host) => (await lookup(host, { all: true })).map((a) => a.address)

/** A web address on the public internet, its host resolved and checked; null
 *  for anything else (see isPrivateAddress). */
export async function publicUrl(raw: string, resolve: Lookup): Promise<URL | null> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (url.port && url.port !== '80' && url.port !== '443') return null
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return null
  try {
    const addresses = isIP(host) ? [host] : await resolve(host)
    if (addresses.length === 0 || addresses.some(isPrivateAddress)) return null
  } catch {
    return null
  }
  return url
}

/** How the menu reader asks: as the website watch does (websiteWatch.ts),
 *  the guide's name in it, taking a PDF or a picture too. It used to say
 *  "compatible; … menu reader", and four food places' sites (Judah, House
 *  of Kosher, Diane's, I Want Moore, Oct 20) refused that and nothing else.
 *  A site that still refuses, or asks a visitor to prove they're a person,
 *  isn't worked around. */
export const MENU_FETCH_HEADERS: Record<string, string> = {
  ...WATCH_FETCH_HEADERS,
  accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,image/webp,image/*;q=0.8,*/*;q=0.5',
}

export type Fetched = { url: string; type: 'html' | 'pdf'; body: string } | { url: string; type: 'picture'; body: string; mime: string }

/** The pictures a model can read. */
const PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** A public page or PDF, following a few redirects, each one checked. Null
 *  when it can't be read. The body is text for a page, base64 for a PDF.
 *  `headers` in place of the menu reader's own: a watch asks as a browser
 *  does (WATCH_FETCH_HEADERS), which some shul sites need. `pictures`: a
 *  JPEG, PNG or WebP is read too, as base64 (a menu posted as a picture). */
export async function fetchPublic(
  raw: string,
  { fetchImpl = fetch, resolve = dnsLookup, headers, pictures = false }: { fetchImpl?: typeof fetch; resolve?: Lookup; headers?: Record<string, string>; pictures?: boolean } = {},
): Promise<Fetched | null> {
  let next = raw
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await publicUrl(next, resolve)
    if (!url) return null
    let res: Response
    try {
      res = await fetchImpl(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: headers ?? MENU_FETCH_HEADERS,
      })
    } catch {
      return null
    }
    if (res.status >= 300 && res.status < 400) {
      const to = res.headers.get('location')
      if (!to) return null
      next = new URL(to, url).toString()
      continue
    }
    if (!res.ok) return null
    const type = (res.headers.get('content-type') ?? '').toLowerCase()
    const length = Number(res.headers.get('content-length') ?? 0)
    if (length > MAX_BYTES) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength > MAX_BYTES) return null
    const isPdf = type.includes('application/pdf') || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)
    if (isPdf) return { url: url.toString(), type: 'pdf', body: Buffer.from(bytes).toString('base64') }
    const picture = PICTURE_TYPES.find((t) => type.includes(t))
    if (picture) return pictures ? { url: url.toString(), type: 'picture', body: Buffer.from(bytes).toString('base64'), mime: picture } : null
    // A calendar feed (text/calendar) is text too: a shul's page links its own (calendarFeed.ts).
    if (type && !type.includes('html') && !type.includes('text/plain') && !type.includes('text/calendar')) return null
    return { url: url.toString(), type: 'html', body: new TextDecoder().decode(bytes) }
  }
  return null
}

// ── Reading a page ───────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', eacute: 'é', hellip: '…' }

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' '
    }
    return ENTITIES[code.toLowerCase()] ?? whole
  })
}

/** A page's readable text, a line per block: what a menu says, without its
 *  scripts, styles and markup. */
export function htmlToText(html: string): string {
  return decode(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer|dt|dd|ul|ol|table)\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

/** What a food place calls its menu when it doesn't say "menu" (Oct 20):
 *  a bakery's "Sweet Shop", a caterer's "Catering", LUHV's "Our Food",
 *  Gelbstein's "Online Ordering" on its own store. */
const MENU_BY_ANOTHER_NAME = /\b(our food|food|products?|catering|meals|shop|store|bakery|baked goods|sweets|treats|order online|online ordering)\b/

/** The registrable part of a host, near enough: its last two labels
 *  ("store.gelbsteinsbakery.com" → "gelbsteinsbakery.com"). */
const siteOf = (hostname: string) => hostname.toLowerCase().split('.').slice(-2).join('.')

/** Links on a page that look like its menu: "Menu", "Our menu", "Dinner
 *  menu", a /menu address, a PDF named for one, then what a place calls its
 *  menu by another name (MENU_BY_ANOTHER_NAME). Best first, in page order
 *  within each. On the same site or one of its own (a store.… or deli.…
 *  of the same name), or a PDF anywhere (menus are often kept on a file
 *  host); never an ordering app's, which is never fetched. */
export function menuLinks(html: string, base: string): string[] {
  const site = new URL(base)
  const own = siteOf(site.hostname)
  const found = new Map<string, number>()
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decode(m[2].trim())
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue
    let url: URL
    try {
      url = new URL(href, site)
    } catch {
      continue
    }
    url.hash = ''
    const text = htmlToText(m[3]).toLowerCase()
    const path = decodeURIComponent(url.pathname).toLowerCase()
    const pdf = path.endsWith('.pdf')
    const ownSite = siteOf(url.hostname) === own && !isOrderingApp(url.toString())
    if (!ownSite && !pdf) continue
    const score = /\bmenus?\b/.test(text)
      ? 4
      : /menu/.test(path)
        ? 3
        : pdf && /menu|food|dinner|lunch/.test(path + text)
          ? 2
          : !pdf && (MENU_BY_ANOTHER_NAME.test(text) || MENU_BY_ANOTHER_NAME.test(path.replace(/[-_/]+/g, ' ')))
            ? 1
            : 0
    if (score === 0 || /order|cart|checkout|login|account/.test(path)) continue
    const key = url.toString()
    if (key === site.toString()) continue
    found.set(key, Math.max(found.get(key) ?? 0, score))
  }
  return [...found].sort((a, b) => b[1] - a[1]).map(([url]) => url)
}

// ── A menu posted as pictures (the user, Oct 20) ─────────────────────────────
// Many small places post their menu as pictures: a scan, a flyer, a
// brochure's pages (A La Karte, LUHV, Mordy's at the ballpark, Star of David
// Grill). The page's words then name no dishes, and the reading failed, though
// the menu was right there. Now a page's pictures that look like its menu
// are kept with it, and read (as photos sent in the "+ Add" box are) when its
// words name no dishes. Only then: a picture costs more to read than words,
// and its dishes can't be checked against the page.

/** At most this many pictures are read: a menu's pages, not a gallery. */
export const MAX_MENU_PICTURES = 4

/** A picture that's part of the page's look, not its menu. */
const NOT_A_MENU_PICTURE = /logo|icon|favicon|sprite|avatar|badge|placeholder|spinner|loading|facebook|instagram|twitter|yelp|tripadvisor|google|apple|android|payment|visa|mastercard|kosher[-_ ]?(cert|symbol|logo)/i

/** The pictures on a page that may be its menu, best first, at most
 *  MAX_MENU_PICTURES: one whose address, alt text or link says "menu" (or
 *  "brochure", "flyer"), then, on a page that is the menu (its menu link, a
 *  page its website links to as its menu), the rest of its pictures. On any
 *  other page (a home page), only those that say so: its food photos aren't
 *  its menu. Never a logo, an icon, an SVG or a GIF. */
export function menuPictures(html: string, base: string, { menuPage }: { menuPage: boolean }): string[] {
  const found: { url: string; says: boolean }[] = []
  const seen = new Set<string>()
  const add = (raw: string | undefined, words: string) => {
    if (!raw) return
    const src = decode(raw.trim())
    if (!src || src.startsWith('data:') || src.includes('{')) return
    let url: URL
    try {
      url = new URL(src, base)
    } catch {
      return
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return
    const path = decodeURIComponent(url.pathname + url.search).toLowerCase()
    if (/\.(svg|gif|ico)(\?|$)/.test(path) || NOT_A_MENU_PICTURE.test(path) || NOT_A_MENU_PICTURE.test(words)) return
    // A Squarespace original can be many megabytes: ask for a readable size.
    if (url.hostname.endsWith('squarespace-cdn.com') && !url.search) url.search = '?format=1500w'
    // One picture once, at whatever size; an image service's own address
    // (Next's /_next/image?url=…) is the picture it serves.
    const key = url.searchParams.get('url') ?? url.hostname + url.pathname
    if (seen.has(key)) return
    seen.add(key)
    found.push({ url: url.toString(), says: /menu|brochure|flyer/i.test(`${path} ${words}`) })
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const attr = (name: string) => new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(m[0])?.[2]
    const srcset = attr('srcset') ?? attr('data-srcset')
    // The largest of a srcset: its last entry, as sites write them.
    const largest = srcset?.split(',').at(-1)?.trim().split(/\s+/)[0]
    add(attr('data-image') ?? attr('data-src') ?? largest ?? attr('src'), `${attr('alt') ?? ''} ${attr('title') ?? ''}`)
  }
  // A link straight to a picture ("View our menu" → menu.jpg), as lightboxes link the full size.
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    if (/\.(jpe?g|png|webp)(\?|$)/i.test(m[2])) add(m[2], htmlToText(m[3]))
  }
  const ordered = [...found.filter((f) => f.says), ...(menuPage ? found.filter((f) => !f.says) : [])]
  return ordered.slice(0, MAX_MENU_PICTURES).map((f) => f.url)
}

/** A menu as read: a page's text, a PDF, or photos of it (a paper menu or
 *  a screenshot, sent in the "+ Add" box), with where it's from. A photo's
 *  `url` is null: there's no page to link to. `pictures`: the addresses of
 *  the page's pictures that may be its menu (menuPictures), read when its
 *  words name no dishes (readMenu). */
export type MenuSource = { url: string | null; text: string | null; pdf: string | null; images?: { mime: string; b64: string }[]; pictures?: string[] }

/** A page's words count as a menu's from this many characters: fewer is a
 *  page drawn by a script, or a picture with a caption. */
const MIN_TEXT = 200

const isPictureAddress = (url: string) => {
  try {
    return /\.(jpe?g|png|webp)$/i.test(new URL(url).pathname)
  } catch {
    return false
  }
}

/** A page as a menu: its words when there are enough, and its pictures
 *  that may be the menu. Null when it has neither. */
function pageAsMenu(page: { url: string; body: string }, menuPage: boolean): MenuSource | null {
  const text = htmlToText(page.body)
  const pictures = menuPictures(page.body, page.url, { menuPage })
  if (text.length < MIN_TEXT && pictures.length === 0) return null
  return { url: page.url, text: text.length >= MIN_TEXT ? text : null, pdf: null, ...(pictures.length ? { pictures } : {}) }
}

/** Delivery and ordering apps, whose menus the server never fetches: they
 *  block readers and their terms forbid it (agreed Oct 6). A person can
 *  still send a screenshot of one. */
const ORDERING_APPS = ['doordash.com', 'ubereats.com', 'grubhub.com', 'seamless.com', 'postmates.com', 'caviar.com', 'toasttab.com', 'chownow.com', 'slicelife.com', 'menufy.com', 'clover.com', 'square.site', 'order.online']

export function isOrderingApp(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, '')
    return ORDERING_APPS.some((h) => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}

/** A page as a browser drew it (renderPage.ts): where it ended up, and its
 *  HTML once its scripts had run. */
export type Rendered = { url: string; body: string }

/** How the reader reaches pages. `render`, when given, draws a page that
 *  came back with almost no words and no menu pictures, as a browser does
 *  (renderPage.ts); without it such a page is given up on. */
type Reach = { fetchImpl?: typeof fetch; resolve?: Lookup; render?: ((url: string) => Promise<Rendered | null>) | null }

/** At most this many pages are drawn in a browser for one website. */
export const MAX_RENDERS = 3

/** How many pages of a website are read for its menu, best first: the
 *  first can be the wrong one (Diane's "Thanksgiving menu coming soon",
 *  I Want Moore's list of its shop's sections). */
export const MAX_MENU_PAGES = 3

/** Where a place's menu may be, best first, MAX_MENU_PAGES at most: pages
 *  or PDFs its own website links to as its menu, then the website itself
 *  (a one-page site often is the menu). A page counts with its words or
 *  its menu's pictures (pageAsMenu); a link to a picture is that picture.
 *  Empty when nothing can be read at all. */
export async function findMenus(website: string, opts: Reach = {}): Promise<MenuSource[]> {
  const fetched = await fetchPublic(website, opts)
  if (!fetched) return []
  if (fetched.type !== 'html') return fetched.type === 'pdf' ? [{ url: fetched.url, text: null, pdf: fetched.body }] : []
  // A page with almost nothing on it may be drawn by a script: drawn in a
  // browser when the caller can (MAX_RENDERS a website).
  let renders = 0
  const drawn = async (page: Rendered): Promise<Rendered | null> => {
    if (!opts.render || renders >= MAX_RENDERS) return null
    renders++
    return opts.render(page.url)
  }
  // Its links too: a script-drawn home page has none until it's drawn.
  const home: Rendered = (pageAsMenu(fetched, false) ? null : await drawn(fetched)) ?? fetched
  const found: MenuSource[] = []
  for (const link of menuLinks(home.body, home.url).slice(0, MAX_MENU_PAGES + 1)) {
    if (found.length >= MAX_MENU_PAGES) break
    if (isPictureAddress(link)) {
      found.push({ url: link, text: null, pdf: null, pictures: [link] })
      continue
    }
    const page = await fetchPublic(link, opts)
    if (!page || page.type === 'picture') continue
    if (page.type === 'pdf') {
      found.push({ url: page.url, text: null, pdf: page.body })
      continue
    }
    // A menu page drawn by a script after it loads has next to no text, and
    // no pictures, until it's drawn.
    let menu = pageAsMenu(page, true)
    if (!menu) {
      const again = await drawn(page)
      menu = again && pageAsMenu(again, true)
    }
    if (menu) found.push(menu)
  }
  const itself = pageAsMenu(home, false)
  if (itself && found.length < MAX_MENU_PAGES) found.push(itself)
  return found
}

/** The best place a website's menu may be (findMenus), or null. */
export async function findMenu(website: string, opts: Reach = {}): Promise<MenuSource | null> {
  return (await findMenus(website, opts))[0] ?? null
}

/** A menu at a known address: a place's menu link (menuLink.ts), read as
 *  it is, a PDF, a page with real text or its menu's pictures on it, or a
 *  picture. Null when it can't be read, or it's an ordering app's (never
 *  fetched, see ORDERING_APPS). */
export async function readMenuPage(url: string, opts: Reach = {}): Promise<MenuSource | null> {
  if (isOrderingApp(url)) return null
  if (isPictureAddress(url)) return { url, text: null, pdf: null, pictures: [url] }
  const page = await fetchPublic(url, opts)
  if (!page) return null
  if (page.type === 'pdf') return { url: page.url, text: null, pdf: page.body }
  const menu = pageAsMenu(page, true)
  if (menu || !opts.render) return menu
  const drawn = await opts.render(page.url)
  return drawn && pageAsMenu(drawn, true)
}

// ── Asking the AI ────────────────────────────────────────────────────────────

/** The guide's own names for dishes, which the AI uses where one fits, so
 *  the menu's "Chicken Shawarma Laffa" is Shawarma, found by "shwarma". */
export const DISH_NAMES = ITEM_NAMES.filter((e) => e.dish).map((e) => e.name)

const INSTRUCTIONS = `You read a kosher food place's own menu and pick its main dishes: what someone would come here to eat.

Rules:
- Up to ${MAX_DISHES} dishes, the ones the menu is built around. Not drinks, sides, sauces, add-ons or kids' items, unless the place is mostly that (a bakery's pastries, an ice cream shop's ice cream).
- Only dishes the menu actually names. Never add one it doesn't, however likely.
- One dish per kind of food, named for the food, not how it's served: a menu's "Falafel Pita", "Falafel Bowl" and "Falafel Salad" are one dish, Falafel; "Sesame Chicken" and "Orange Chicken" can stay two only if people would ask for each by name.
- Name each the way people ask for it, short and general, plural where people order several kinds ("Burgers", "Pizza", "Shawarma", "Salads"). Use one of these names when it fits: ${DISH_NAMES.join(', ')}. Otherwise a short plain name in Title Case.
- Fewer is better than padding. If you were shown only part of a menu (a few photos, one section), pick the main dishes in that part; never fill the list with vegetables, rice, noodles or other sides because nothing else is there. Return fewer, or none, and say in "note" that it looks like only part of the menu.
- For each dish, "quote" is a few words copied exactly from the menu where you read it (a heading or an item line), so a person can find it. Copy the words exactly as written, including their spelling and capitals.
- If what you were given isn't a menu, or names no dishes, return no dishes and say why in "note".

Answer in JSON only: {"dishes": [{"name": "...", "quote": "..."}], "note": "..."}`

/** The messages sent: a page as its text, a PDF as the file itself. */
export function menuMessages(source: MenuSource, placeName: string): unknown[] {
  const intro = `The place: ${placeName}. Its menu, ${source.url ? `from ${source.url}` : 'in the photos'}:`
  const content = source.images?.length
    ? [{ type: 'text', text: intro }, ...source.images.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.b64}` } }))]
    : source.pdf
    ? [
        { type: 'text', text: intro },
        { type: 'file', file: { filename: 'menu.pdf', file_data: `data:application/pdf;base64,${source.pdf}` } },
      ]
    : `${intro}\n\n${(source.text ?? '').slice(0, MAX_TEXT)}`
  return [
    { role: 'system', content: INSTRUCTIONS },
    { role: 'user', content },
  ]
}

/** Words compared as the menu writes them, give or take case, spacing,
 *  punctuation and accents. */
function plain(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()
}

/**
 * What the AI said, kept to what holds up: a dish with a name that can be
 * an item and a quote, at most once each under any of its names, ten at
 * most, named as the item list names it ("Burger" is Burgers). With the
 * page's text, a dish whose quote isn't on the page is dropped: the AI
 * made it up or misread it, and either way the menu doesn't say it.
 */
export function tidyMenuReading(raw: unknown, source: MenuSource): MenuReading {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const list = Array.isArray(body.dishes) ? body.dishes : []
  const page = source.text ? ` ${plain(source.text)} ` : null
  const seen = new Set<string>()
  const dishes: MenuDish[] = []
  for (const d of list) {
    if (dishes.length >= MAX_DISHES) break
    if (!d || typeof d !== 'object') continue
    const name = cleanItemName((d as Record<string, unknown>).name)
    const quoteRaw = (d as Record<string, unknown>).quote
    const quote = typeof quoteRaw === 'string' ? quoteRaw.replace(/\s+/g, ' ').trim().slice(0, 160) : ''
    if (!name || !quote) continue
    const said = plain(quote)
    if (!said) continue
    if (page && !page.includes(` ${said} `)) continue
    const named = addedItemName(name)
    const key = itemName(named).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const nameWords = new Set(itemWords(named))
    dishes.push({ name: named, quote, checked: !!page, named: words(quote).some((w) => nameWords.has(w)) })
  }
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 300) : null
  return { sourceUrl: source.url, dishes, note: dishes.length ? null : (note ?? 'No main dishes found on the menu.') }
}

/** The page's menu pictures, fetched as the page was: those that can be
 *  read, in order. */
async function fetchPictures(urls: readonly string[], opts: { fetchImpl?: typeof fetch; resolve?: Lookup }): Promise<{ mime: string; b64: string }[]> {
  const got = await Promise.all(urls.slice(0, MAX_MENU_PICTURES).map((u) => fetchPublic(u, { ...opts, pictures: true }).catch(() => null)))
  return got.flatMap((g) => (g?.type === 'picture' ? [{ mime: g.mime, b64: g.body }] : []))
}

async function askModel(source: MenuSource, placeName: string, apiKey: string, model: string, fetchImpl: typeof fetch): Promise<MenuReading> {
  const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: menuMessages(source, placeName), response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(45_000),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string }; choices?: { message?: { content?: string } }[] }
  if (!res.ok) throw new Error(`Menu reader: ${res.status} ${body.error?.message ?? ''}`.trim())
  let raw: unknown = null
  try {
    raw = JSON.parse(body.choices?.[0]?.message?.content ?? 'null')
  } catch {
    raw = null
  }
  return tidyMenuReading(raw, source)
}

/** The AI's reading of a menu: its words, PDF or photos; and when those
 *  name no dishes (or a page has no words to speak of), the page's menu
 *  pictures (menuPictures), as photos are read. `fromPictures` says the
 *  dishes came from those: they can't be checked against the page's words.
 *  `fetchImpl` fetches the pictures too. */
export async function readMenu(
  source: MenuSource,
  placeName: string,
  { apiKey, model = DEFAULT_READER_MODEL, fetchImpl = fetch, resolve }: { apiKey: string; model?: string; fetchImpl?: typeof fetch; resolve?: Lookup },
): Promise<MenuReading & { model: string; fromPictures?: boolean }> {
  const hasWords = !!(source.text || source.pdf || source.images?.length)
  const first = hasWords ? await askModel(source, placeName, apiKey, model, fetchImpl) : null
  if (first?.dishes.length || !source.pictures?.length) return { ...(first ?? { sourceUrl: source.url, dishes: [], note: 'No menu found on that page.' }), model }
  const images = await fetchPictures(source.pictures, { fetchImpl, resolve })
  if (!images.length) return { ...(first ?? { sourceUrl: source.url, dishes: [], note: 'Its menu’s pictures couldn’t be opened.' }), model }
  const read = await askModel({ url: source.url, text: null, pdf: null, images }, placeName, apiKey, model, fetchImpl)
  // Nothing there either: what the words said is the better reason.
  if (!read.dishes.length && first) return { ...first, model }
  return { ...read, dishes: read.dishes.map((d) => ({ ...d, picture: true as const })), model, fromPictures: true }
}

/** Reads the pages a menu may be on (findMenus), best first, until one
 *  names dishes. When none does, the first page's reading, which says why.
 *  Stops trying more once `budgetMs` has gone (a request has a minute). */
export async function readMenus(
  sources: readonly MenuSource[],
  placeName: string,
  opts: { apiKey: string; model?: string; fetchImpl?: typeof fetch; resolve?: Lookup; budgetMs?: number; now?: () => number },
): Promise<(MenuReading & { model: string; fromPictures?: boolean }) | null> {
  const now = opts.now ?? Date.now
  const start = now()
  let first: Awaited<ReturnType<typeof readMenu>> | null = null
  for (const source of sources) {
    if (first && now() - start > (opts.budgetMs ?? 30_000)) break
    const read = await readMenu(source, placeName, opts)
    if (read.dishes.length) return read
    first ??= read
  }
  return first
}
