import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { ITEM_NAMES, itemName, itemWords } from './itemNames'
import { words } from './ask'
import { addedItemName, cleanItemName } from './itemMarks'
import { DEFAULT_READER_MODEL } from './readQuestion'

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
  /** Whether those words were found on the page we fetched. False only for
   *  a PDF, which the AI read as a file. */
  checked: boolean
  /** Whether those words name the dish ("Classic Burger" for Burgers), not
   *  only a line near it ("Sandwich" for Falafel): the admin looks twice
   *  at one that doesn't. */
  named?: boolean
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

type Lookup = (host: string) => Promise<string[]>
const dnsLookup: Lookup = async (host) => (await lookup(host, { all: true })).map((a) => a.address)

async function publicUrl(raw: string, resolve: Lookup): Promise<URL | null> {
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

export type Fetched = { url: string; type: 'html' | 'pdf'; body: string }

/** A public page or PDF, following a few redirects, each one checked. Null
 *  when it can't be read. The body is text for a page, base64 for a PDF. */
export async function fetchPublic(
  raw: string,
  { fetchImpl = fetch, resolve = dnsLookup }: { fetchImpl?: typeof fetch; resolve?: Lookup } = {},
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
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; community-guide menu reader)', Accept: 'text/html,application/pdf;q=0.9,*/*;q=0.5' },
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
    if (type && !type.includes('html') && !type.includes('text/plain')) return null
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

/** Links on a page that look like its menu: "Menu", "Our menu", "Dinner
 *  menu", a /menu address, a PDF named for one. Best first: a link that
 *  says it's the menu, then one whose address does. On the same site, or a
 *  PDF anywhere (menus are often kept on a file host). */
export function menuLinks(html: string, base: string): string[] {
  const site = new URL(base)
  const host = site.hostname.replace(/^www\./, '')
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
    const sameSite = url.hostname.replace(/^www\./, '') === host
    if (!sameSite && !pdf) continue
    const score = /\bmenus?\b/.test(text) ? 3 : /menu/.test(path) ? 2 : pdf && /menu|food|dinner|lunch/.test(path + text) ? 1 : 0
    if (score === 0 || /order|cart|checkout|login|account/.test(path)) continue
    const key = url.toString()
    if (key === site.toString()) continue
    found.set(key, Math.max(found.get(key) ?? 0, score))
  }
  return [...found].sort((a, b) => b[1] - a[1]).map(([url]) => url)
}

/** A menu as read: a page's text, a PDF, or photos of it (a paper menu or
 *  a screenshot, sent in the "+ Add" box), with where it's from. A photo's
 *  `url` is null: there's no page to link to. */
export type MenuSource = { url: string | null; text: string | null; pdf: string | null; images?: { mime: string; b64: string }[] }

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

/** Where a place's menu is: a page or PDF its own website links to as its
 *  menu, the best of the first few that can be read, or else the website
 *  itself (a one-page site often is the menu). Null when nothing can be
 *  read at all. */
export async function findMenu(
  website: string,
  opts: { fetchImpl?: typeof fetch; resolve?: Lookup } = {},
): Promise<MenuSource | null> {
  const home = await fetchPublic(website, opts)
  if (!home) return null
  if (home.type === 'pdf') return { url: home.url, text: null, pdf: home.body }
  const homeText = htmlToText(home.body)
  for (const link of menuLinks(home.body, home.url).slice(0, 3)) {
    const page = await fetchPublic(link, opts)
    if (!page) continue
    if (page.type === 'pdf') return { url: page.url, text: null, pdf: page.body }
    const text = htmlToText(page.body)
    // A menu page drawn by a script after it loads has next to no text.
    if (text.length >= 200) return { url: page.url, text, pdf: null }
  }
  return homeText.length >= 200 ? { url: home.url, text: homeText, pdf: null } : null
}

// ── Asking the AI ────────────────────────────────────────────────────────────

/** The guide's own names for dishes, which the AI uses where one fits, so
 *  the menu's "Chicken Shawarma Laffa" is Shawarma, found by "shwarma". */
export const DISH_NAMES = ITEM_NAMES.filter((e) => e.dish).map((e) => e.name)

const INSTRUCTIONS = `You read a kosher food place's own menu and pick its main dishes: what someone would come here to eat.

Rules:
- Up to ${MAX_DISHES} dishes, the ones the menu is built around. Not drinks, sides, sauces, add-ons or kids' items, unless the place is mostly that (a bakery's pastries, an ice cream shop's ice cream).
- Only dishes the menu actually names. Never add one it doesn't, however likely.
- Name each the way people ask for it, short and general, plural where people order several kinds ("Burgers", "Pizza", "Shawarma", "Salads"). Use one of these names when it fits: ${DISH_NAMES.join(', ')}. Otherwise a short plain name in Title Case.
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

export async function readMenu(
  source: MenuSource,
  placeName: string,
  { apiKey, model = DEFAULT_READER_MODEL, fetchImpl = fetch }: { apiKey: string; model?: string; fetchImpl?: typeof fetch },
): Promise<MenuReading & { model: string }> {
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
  return { ...tidyMenuReading(raw, source), model }
}
