import type { PlaceKind } from './placeKinds'

// ── A place's Read from box (board W3, Nov 25) ──────────────────────────────
// At the top of a place, what it's read from, each with a mark and the one
// thing to do about it. Each empty row carries its own way to fill it (the
// user, Nov 25: "Build as described"):
//   Its website   not set: Add its website, Save. Set: Change and Read now.
//   Its emails    shuls and eruvs: Sign up as the community email, Copy
//                 address; an email from a sender linked to nothing: Link it.
//   Google        not matched: Find it on Google. An eruv: not for an eruv.
//   Its menu      food that keeps a menu link: Add its menu link.
//   Kosher lists and Refuah: shown, added on their Watches row.
// Only the rows that apply to its kind. Pure; ReadFrom.tsx draws it.

export type ReadFromAction = 'add' | 'change' | 'read' | 'copy' | 'link' | 'find' | 'setup'

export type ReadFromRow = {
  key: 'website' | 'emails' | 'google' | 'menu' | 'lists' | 'refuah'
  name: string
  done: boolean
  line: string
  /** The line in amber: it's set, but it isn't being read. */
  amber?: boolean
  actions: ReadFromAction[]
  /** Link it: the sender that came in. */
  link?: { id: string; sender: string }
  /** Copy address: the community email. */
  copy?: string
}

export type ReadFromIn = {
  kind: PlaceKind | 'eruv'
  /** Its website; undefined when its kind keeps none. */
  website?: string | null
  /** Its website's read: null when nothing reads it; `ok` false once its
   *  page won't open. */
  site: { ok: boolean } | null
  /** Read now can be offered. */
  canRead: boolean
  /** Senders linked to it, newest email first. */
  emails: readonly { sender: string; at: string | null }[]
  /** A sender linked to nothing, that has sent an email. */
  waiting: { id: string; sender: string } | null
  communityEmail: string | null
  /** An eruv whose status comes from a page: one source for its status,
   *  so it takes no email for it too. */
  statusPage?: string | null
  /** Its Google match: undefined when Google isn't kept for its kind. */
  google?: { matched: boolean }
  /** Its menu link, for a place that keeps one. */
  menu?: string | null
  lists: readonly string[]
  refuah: boolean
}

export const shortAddress = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '')

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })

/** "A’s list and B’s list". */
const listWords = (names: readonly string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

export function readFromRows(p: ReadFromIn): ReadFromRow[] {
  const rows: ReadFromRow[] = []
  if (p.website === undefined) {
    // No website field to fill.
  } else if (!p.website) rows.push({ key: 'website', name: 'Its website', done: false, line: 'Not set', actions: ['add'] })
  else {
    const where = shortAddress(p.website)
    const read = p.canRead ? (['read'] as const) : []
    if (p.site && !p.site.ok) rows.push({ key: 'website', name: 'Its website', done: false, amber: true, line: `${where} · won’t open`, actions: ['change', ...read] })
    else rows.push({ key: 'website', name: 'Its website', done: !!p.site, line: p.site ? `${where} · every night` : where, actions: ['change', ...read] })
  }
  if (p.kind === 'shuls' || p.kind === 'eruv') {
    const last = p.emails[0]
    if (!last && p.statusPage) rows.push({ key: 'emails', name: 'Its status', done: true, line: `From ${shortAddress(p.statusPage)}`, actions: [] })
    else if (last) rows.push({ key: 'emails', name: 'Its emails', done: true, line: last.at ? `${last.sender} · last ${day(last.at)}` : last.sender, actions: [] })
    else if (p.waiting) rows.push({ key: 'emails', name: 'Its emails', done: false, line: `An email from ${p.waiting.sender} came in`, actions: ['link'], link: p.waiting })
    else if (p.communityEmail) rows.push({ key: 'emails', name: 'Its emails', done: false, line: `Sign up as ${p.communityEmail}`, actions: ['copy'], copy: p.communityEmail })
    else rows.push({ key: 'emails', name: 'Its emails', done: false, line: 'Needs the community email', actions: ['setup'] })
  }
  if (p.kind === 'eruv') rows.push({ key: 'google', name: 'Google', done: true, line: 'Not for an eruv', actions: [] })
  else if (p.google) rows.push({ key: 'google', name: 'Google', done: p.google.matched, line: p.google.matched ? 'Matched' : 'Not matched', actions: p.google.matched ? [] : ['find'] })
  if (p.menu !== undefined) rows.push(p.menu ? { key: 'menu', name: 'Its menu', done: true, line: shortAddress(p.menu), actions: ['change'] } : { key: 'menu', name: 'Its menu', done: false, line: 'Not set', actions: ['add'] })
  if (p.lists.length) rows.push({ key: 'lists', name: 'Kosher lists', done: true, line: `On ${listWords(p.lists)}`, actions: [] })
  if (p.refuah) rows.push({ key: 'refuah', name: 'Refuah', done: true, line: 'Its page on Refuah', actions: [] })
  return rows
}
