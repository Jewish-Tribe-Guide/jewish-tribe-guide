import { readContact, readContacts, contactLine, type ContactEntry } from './contacts'

// ─────────────────────────────────────────────────────────────────────────────
// The Refuah watch (Oct 17): a hospital's details were copied from Refuah's
// page once, on Oct 6, and nothing read Refuah again. Now each hospital's
// page is watched, and anything Refuah has that the guide doesn't goes to
// the moderation queue, labelled "From Refuah", the way Keystone-K's list
// is watched. An admin approves each one; approved, the listing's date
// says "From Refuah, Oct 20" (confirmedFrom).
//
// Refuah's pages build themselves in the browser (an empty shell, six words,
// to anything that reads the page itself), from a public data service the
// page calls: one record per hospital, with its liaisons and its services
// by type. The watch asks that service what the page asks it. Daily, one
// request per hospital.
//
// The guide's entries were read from Refuah by the AI reader and reworded
// ("Food Packages To Hospitals, Call To Arrange" became "Food packages to
// hospitals; call to arrange."), so a word-for-word comparison would call
// every entry changed. What's compared is what a visitor acts on: is the
// entry there (by name, or by a phone only it has), and are its phones,
// email and website the same. Wording is left alone. Nothing is removed:
// an entry Refuah no longer has is said on the card, for the admin to
// decide.
//
// Pure: no network, no database. refuahRun.ts runs it.
// ─────────────────────────────────────────────────────────────────────────────

/** submitted_by.name on every suggestion the watch makes. */
export const REFUAH_WATCH_NAME = 'Refuah (automated)'
export const REFUAH_NAME = 'Refuah'

/** The data service Refuah's own pages read from. */
export const REFUAH_DATA_URL = 'https://veracious-panther-907.convex.cloud/api/query'

/** The hospital a Refuah page is for: refuah.com/hospitals/<id>. Null for
 *  any other page (Refuah's search, its home page, another site). */
export function refuahHospitalId(url: string): string | null {
  try {
    const u = new URL(url)
    if (!/(^|\.)refuah\.(com|lrbcol\.org)$/i.test(u.hostname)) return null
    const m = /^\/hospitals\/([a-z0-9]{20,40})\/?$/i.exec(u.pathname)
    return m ? m[1] : null
  } catch {
    return null
  }
}

export type RefuahPerson = { name?: string; info?: string; phone1?: string; phone2?: string; email?: string }
export type RefuahService = RefuahPerson & { type?: string }
export type RefuahHospital = { _id?: string; name?: string; liaisons?: RefuahPerson[]; services?: RefuahService[] }

/** Whether Refuah has anything for the hospital to agree with: a record
 *  with no liaisons or services (Penn Presbyterian, Oct 17) matches the
 *  guide only by having nothing, so it doesn't date the listing. */
export function refuahHasEntries(record: RefuahHospital): boolean {
  return (record.liaisons?.length ?? 0) + (record.services?.length ?? 0) > 0
}

/** Which of the guide's hospital fields each kind of Refuah entry goes in
 *  (the fields set up Oct 6 on Refuah's sections). A kind not here goes in
 *  "miscellaneous" ("Also"). */
const FIELD_FOR_TYPE: Record<string, string> = {
  pantry: 'pantry',
  food_packages: 'food_packages',
  accommodations: 'accommodations',
  transportations: 'transportation',
  transportation: 'transportation',
}
export const LIAISONS_KEY = 'liaisons'
const OTHER_KEY = 'miscellaneous'

/** One of Refuah's entries as the guide keeps it. Its "info" is a few
 *  "Label: value" lines ("Directions: …", "Organization: …", "Coordinated
 *  By: …", "Web: …", "Servicing: Monsey") and free text, which is the note. */
export function refuahEntry(p: RefuahPerson, opts: { liaison?: boolean; from?: boolean } = {}): ContactEntry | null {
  const raw: Record<string, unknown> = { name: p.name, phones: [p.phone1, p.phone2].filter(Boolean), email: p.email }
  const notes: string[] = []
  for (const line of String(p.info ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    if (opts.liaison) {
      notes.push(line)
      continue
    }
    const m = /^(directions|organization|coordinated by|contact|web|website|email|servicing)\s*:\s*(.+)$/i.exec(line)
    const servicing = !m && /^servicing\s+(.+)$/i.exec(line)
    const label = m ? m[1].toLowerCase() : servicing ? 'servicing' : null
    const value = m ? m[2].trim() : servicing ? servicing[1].trim() : line
    if (label === 'directions') raw.name = raw.name ? `${raw.name}, ${value}` : value
    else if (label === 'organization' || label === 'coordinated by' || label === 'contact') raw.who = value
    else if (label === 'web' || label === 'website') raw.web = value
    else if (label === 'email') raw.email = value
    else if (label === 'servicing' && opts.from) raw.from = value
    else notes.push(value)
  }
  // A liaison's info is the person ("Mrs. Schwartz").
  if (opts.liaison) raw.who = notes.splice(0).join(' ')
  if (notes.length) raw.note = notes.join(' ')
  return readContact(raw)
}

/** A hospital's record, as entries for each of the guide's fields. Only
 *  fields the category has (`keys`); a kind with nowhere to go is left out. */
export function refuahFields(h: RefuahHospital, keys: ReadonlySet<string>, fromKeys: ReadonlySet<string> = new Set()): Record<string, ContactEntry[]> {
  const out: Record<string, ContactEntry[]> = {}
  const add = (key: string, e: ContactEntry | null) => {
    if (!e || !keys.has(key)) return
    ;(out[key] ??= []).push(e)
  }
  for (const l of h.liaisons ?? []) add(LIAISONS_KEY, refuahEntry(l, { liaison: true }))
  for (const s of h.services ?? []) {
    const key = FIELD_FOR_TYPE[String(s.type ?? '').toLowerCase()] ?? OTHER_KEY
    add(key, refuahEntry(s, { from: fromKeys.has(key) }))
  }
  return out
}

const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
const digits = (p: string) => p.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
const phoneSet = (e: ContactEntry) => new Set((e.phones ?? []).map(digits).filter(Boolean))
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x))
const sameWeb = (a: string, b: string) => loose(a.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')) === loose(b.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''))

/** The guide's entry that's Refuah's: the same name, or failing that a
 *  phone only one of the guide's entries has. */
function matchOf(r: ContactEntry, guide: ContactEntry[], taken: Set<number>): number {
  const byName = guide.findIndex((g, i) => !taken.has(i) && loose(g.name) === loose(r.name))
  if (byName >= 0) return byName
  for (const p of phoneSet(r)) {
    const having = guide.map((g, i) => (!taken.has(i) && phoneSet(g).has(p) ? i : -1)).filter((i) => i >= 0)
    const elsewhere = guide.filter((g) => phoneSet(g).has(p)).length
    if (having.length === 1 && elsewhere === 1) return having[0]
  }
  return -1
}

export type FieldDifference = {
  key: string
  /** The field as it would be: the guide's entries with Refuah's phones,
   *  email and website, then Refuah's entries it lacks. */
  after: ContactEntry[]
  /** For the card: "+ Darchei Chesed · (845) 425-4070", "Bikur Cholim of
   *  Philadelphia: phone (215) 805-8668 → (215) 805-9000". */
  lines: string[]
  /** The guide's entries Refuah doesn't have, by name. Kept. */
  notOnRefuah: string[]
}

/** Where a listing differs from Refuah, field by field. Empty when every
 *  entry Refuah has is in the guide with the same phones, email and site. */
export function compareRefuah(details: Record<string, unknown>, refuah: Record<string, ContactEntry[]>, labels: Record<string, string> = {}): FieldDifference[] {
  const out: FieldDifference[] = []
  for (const [key, theirs] of Object.entries(refuah)) {
    const ours = readContacts(details[key])
    const after = ours.map((e) => ({ ...e }))
    const lines: string[] = []
    const taken = new Set<number>()
    const label = labels[key] ?? key
    for (const r of theirs) {
      const i = matchOf(r, ours, taken)
      if (i < 0) {
        after.push(r)
        lines.push(`+ ${label}: ${contactLine(r)}`)
        continue
      }
      taken.add(i)
      const g = ours[i]
      const said: string[] = []
      if (r.phones?.length && !sameSet(phoneSet(r), phoneSet(g))) {
        said.push(`phone ${(g.phones ?? []).join(', ') || 'none'} → ${r.phones.join(', ')}`)
        after[i].phones = r.phones
      }
      if (r.email && r.email.toLowerCase() !== (g.email ?? '').toLowerCase()) {
        said.push(`email ${g.email ?? 'none'} → ${r.email}`)
        after[i].email = r.email
      }
      if (r.web && !(g.web && sameWeb(g.web, r.web))) {
        said.push(`website ${g.web ?? 'none'} → ${r.web}`)
        after[i].web = r.web
      }
      if (said.length) lines.push(`${label}, ${g.name}: ${said.join('; ')}`)
    }
    if (lines.length === 0) continue
    const notOnRefuah = ours.filter((_, i) => !taken.has(i)).map((e) => e.name)
    out.push({ key, after: readContacts(after), lines, notOnRefuah })
  }
  return out
}

/** The card's note: what Refuah says that the guide doesn't, then what the
 *  guide has that Refuah doesn't (kept). */
export function refuahNote(hospital: string, url: string, diffs: FieldDifference[]): string {
  const kept = diffs.flatMap((d) => d.notOnRefuah)
  return [
    `Refuah’s page for ${hospital} differs from the guide:`,
    diffs.flatMap((d) => d.lines).join('\n'),
    kept.length ? `In the guide, not on Refuah (kept, not removed): ${kept.join(', ')}` : '',
    url,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** The same suggestion, so one an admin rejected isn't made again until
 *  Refuah changes: the fields it would set, as they'd be. */
export function refuahKey(listingId: string, fields: Record<string, unknown>): string {
  const keys = Object.keys(fields).sort()
  return `${listingId}|${JSON.stringify(keys.map((k) => [k, readContacts(fields[k])]))}`
}

/** A fingerprint of what Refuah says, for the Watches tab's "Changed". */
export function refuahFingerprint(refuah: Record<string, ContactEntry[]>): string {
  return JSON.stringify(Object.keys(refuah).sort().map((k) => [k, refuah[k]]))
}
