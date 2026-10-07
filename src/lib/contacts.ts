import { formatPhone } from './validation'

// ── A list of contacts (Oct 6: hospitals on Refuah's sections) ──────────────
// One field holding as many entries as a section needs: a hospital's
// liaisons (CHOP has four), its pantries, places to stay, rides. Every entry
// is the same few things, any of them blank but a name:
//
//   name    "Bikur Cholim of Philadelphia", or a place: "1st floor, Pavilion
//           Building"
//   who     a person ("Mrs. Schwartz"), or the organisation for a place
//   phones  one or more, each tap to call
//   email, web
//   note    a line or two ("Call to arrange.")
//   from    where it's from, for a field with entryFrom: "Monsey"
//
// Stored as given and read through readContacts, so an odd shape (a phone
// as a string, an entry with only a "who") still reads, and nothing that
// isn't an entry is ever shown.

export type ContactEntry = {
  name: string
  who?: string
  phones?: string[]
  email?: string
  web?: string
  note?: string
  from?: string
}

export const MAX_CONTACTS = 20
const MAX_PHONES = 4
const LIMIT: Record<Exclude<keyof ContactEntry, 'phones'>, number> = { name: 120, who: 120, email: 120, web: 300, note: 500, from: 60 }

function text(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.replace(/\s+/g, ' ').trim().slice(0, max)
  return t || undefined
}

function phonesOf(v: unknown): string[] | undefined {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[;,]|\s+or\s+/i) : []
  const out = [...new Set(raw.map((p) => text(p, 40)).filter((p): p is string => !!p && /\d{3}/.test(p)))].slice(0, MAX_PHONES)
  return out.length ? out : undefined
}

/** One entry in its checked shape, or null for something that isn't one.
 *  An entry with a person and no name is named by the person. */
export function readContact(v: unknown): ContactEntry | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  let name = text(o.name, LIMIT.name)
  let who = text(o.who, LIMIT.who)
  if (!name && who) [name, who] = [who, undefined]
  if (!name) return null
  const entry: ContactEntry = { name }
  if (who && who !== name) entry.who = who
  const phones = phonesOf(o.phones ?? o.phone)
  if (phones) entry.phones = phones
  for (const k of ['email', 'web', 'note', 'from'] as const) {
    const t = text(o[k], LIMIT[k])
    if (t) entry[k] = t
  }
  return entry
}

/** A field's entries, in order. Empty for anything that isn't a list. */
export function readContacts(v: unknown): ContactEntry[] {
  if (!Array.isArray(v)) return []
  return v.map(readContact).filter((e): e is ContactEntry => !!e).slice(0, MAX_CONTACTS)
}

export function sameContacts(a: unknown, b: unknown): boolean {
  return JSON.stringify(readContacts(a)) === JSON.stringify(readContacts(b))
}

/** A web address as people say it ("bikkurcholimphilly.org/hospitality"),
 *  and the link to it. */
export function webLink(web: string): { label: string; href: string } {
  const href = /^https?:\/\//i.test(web) ? web : `https://${web}`
  return { label: web.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, ''), href }
}

/** An entry on one line, every part of it, for the moderation queue and the
 *  diff: "From Monsey: Darchei Chesed · (845) 425-4070". A change to any
 *  part changes the line, so the queue never shows an edit as no change. */
export function contactLine(e: ContactEntry): string {
  const parts = [e.name, e.who, e.phones?.map((p) => formatPhone(p)).join(', '), e.email, e.web, e.note].filter(Boolean)
  return `${e.from ? `From ${e.from}: ` : ''}${parts.join(' · ')}`
}

/** A list, a line an entry; empty for none. */
export function contactsSummary(v: unknown): string {
  return readContacts(v).map(contactLine).join('\n')
}

/** Everything a search can match in a list: names, people, notes, where
 *  from. Phones and addresses aren't words anyone searches. */
export function contactsText(v: unknown): string {
  return readContacts(v)
    .map((e) => [e.from, e.name, e.who, e.note].filter(Boolean).join(' '))
    .join(' ')
}

/** What an edit did to a list, by name, for the line above Send: "+ Chai
 *  House · − Ronald McDonald House · Changed: Bikur Cholim". */
export function contactsChange(before: unknown, after: unknown): string {
  const b = readContacts(before)
  const a = readContacts(after)
  const line = new Map(b.map((e) => [e.name, contactLine(e)]))
  const names = new Set(a.map((e) => e.name))
  const added = a.filter((e) => !line.has(e.name)).map((e) => e.name)
  const removed = b.filter((e) => !names.has(e.name)).map((e) => e.name)
  const changed = a.filter((e) => line.has(e.name) && line.get(e.name) !== contactLine(e)).map((e) => e.name)
  return [added.length ? `+ ${added.join(', ')}` : '', removed.length ? `− ${removed.join(', ')}` : '', changed.length ? `Changed: ${changed.join(', ')}` : '']
    .filter(Boolean)
    .join(' · ') || 'Reordered'
}

const looseName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

/** A list with what a message gave added to it: an entry named like one
 *  already there updates the parts it gives (a new phone), any other is
 *  added at the end. Nothing is taken off: a message rarely says what's
 *  gone, and a pasted page that leaves one out may just be shorter. Taking
 *  one off is the editor's job. */
export function mergeContacts(current: unknown, read: unknown): ContactEntry[] {
  const out = readContacts(current)
  for (const e of readContacts(read)) {
    const i = out.findIndex((x) => looseName(x.name) === looseName(e.name))
    if (i >= 0) out[i] = { ...out[i], ...e }
    else out.push(e)
  }
  return out.slice(0, MAX_CONTACTS)
}
