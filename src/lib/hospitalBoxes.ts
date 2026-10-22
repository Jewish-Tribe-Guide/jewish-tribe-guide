import type { CategoryConfig } from './categories'
import { editorRows } from './editorRows'
import { readContacts, type ContactEntry } from './contacts'
import { formatPhone } from './validation'

// ── A hospital, as its listing's own boxes (Oct 22) ─────────────────────────
// Drawn on artifact Jf2Nvzj8dy1fWop5ZzVFmy (agreed Oct 21): Hospitals shows
// a hospital as the boxes its listing has, Who to call, Kosher food, A
// place to stay, Rides, Also, each with its people, and Use this takes a
// box whole. So what Refuah says is filed a box at a time, the way a
// mikvah's sections are (hoursSections.ts), and approved onto the listing
// as it is then (rebaseSection).

/** One of the listing's boxes, by its heading, and its lists of contacts:
 *  what Refuah fills. */
export type ContactBox = { title: string; keys: string[] }

/** The boxes the listing shows its lists of contacts in, in its order:
 *  the admin's boxes, then a list in none of them under its own label
 *  (ListingView, editorRows). */
export function contactBoxes(category: CategoryConfig, details: Record<string, unknown>): ContactBox[] {
  return editorRows(category, details)
    .filter((r) => r.kind === 'fields' && r.id.startsWith('box:'))
    .map((r) => ({ title: r.title, keys: r.fields.filter((f) => f.type === 'contacts').map((f) => f.key) }))
    .filter((b) => b.keys.length > 0)
}

/** The box a field is shown in; one in none, a box of its own. */
export function boxOf(boxes: readonly ContactBox[], key: string, label: string): ContactBox {
  return boxes.find((b) => b.keys.includes(key)) ?? { title: label, keys: [key] }
}

// ── A box's rows, as its box shows them ────────────────────────────────────

export type ContactRowMark = 'same' | 'new' | 'changed' | 'gone'
export type ContactRow = { name: string; sub: string; right: string; was?: string; mark: ContactRowMark }

const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
const phonesOf = (e: ContactEntry) => (e.phones ?? []).map((p) => formatPhone(p)).join(', ')
const digits = (e: ContactEntry) => (e.phones ?? []).map((p) => p.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')).sort().join(',')
/** Where it's from, who, its note, and its email when that isn't on the
 *  right: "From Philadelphia · bikurcholimphilly@gmail.com". */
const subOf = (e: ContactEntry, email = true) => [e.from && `From ${e.from}`, e.who, e.note, email && e.email].filter(Boolean).join(' · ')

/** An entry's row: its name, where it's from, who and its note under it,
 *  its phones on the right; changed, the new phone, email or website,
 *  and what each was. */
function rowOf(e: ContactEntry, was?: ContactEntry): ContactRow {
  if (!was) return { name: e.name, sub: subOf(e, !!phonesOf(e)), right: phonesOf(e) || e.email || e.web || '', mark: 'same' }
  const right: string[] = []
  const old: string[] = []
  if (digits(e) !== digits(was)) {
    right.push(phonesOf(e) || 'No phone')
    old.push(phonesOf(was) || 'No phone')
  }
  if ((e.email ?? '').toLowerCase() !== (was.email ?? '').toLowerCase()) {
    right.push(e.email ?? 'No email')
    old.push(was.email ?? 'No email')
  }
  if (loose(e.web ?? '') !== loose(was.web ?? '')) {
    right.push(e.web ?? 'No website')
    old.push(was.web ?? 'No website')
  }
  if (!right.length) return rowOf(e)
  return { name: e.name, sub: subOf(e, !right.includes(e.email ?? 'No email')), right: right.join(' · '), was: old.join(' · '), mark: 'changed' }
}

/** A box's list as rows, the listing's order: each of its entries the
 *  same, changed, or going; then the ones Refuah adds. */
export function contactRows(now: unknown, next: unknown = now): ContactRow[] {
  const a = readContacts(now)
  const b = readContacts(next)
  const used = new Set<number>()
  const rows: ContactRow[] = a.map((e) => {
    const i = b.findIndex((x, j) => !used.has(j) && loose(x.name) === loose(e.name))
    if (i < 0) return { ...rowOf(e), mark: 'gone' }
    used.add(i)
    return rowOf(b[i], e)
  })
  b.forEach((e, j) => {
    if (!used.has(j)) rows.push({ ...rowOf(e), mark: 'new' })
  })
  return rows
}

/** A box's pill: what kind its updates are when they're one kind ("1 new",
 *  "2 changes", "1 not on Refuah"), else how many ("3 updates"). */
export function boxPill(rows: readonly ContactRow[]): string {
  const lit = rows.filter((r) => r.mark !== 'same')
  const n = lit.length
  const kinds = new Set(lit.map((r) => r.mark))
  if (!n) return 'Update'
  if (kinds.size > 1) return `${n} updates`
  if (kinds.has('new')) return `${n} new`
  if (kinds.has('gone')) return `${n} not on Refuah`
  return `${n} change${n === 1 ? '' : 's'}`
}
