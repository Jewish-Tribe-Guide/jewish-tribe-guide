import { selectValues, type CategoryConfig, type CategoryField } from './categories'
import { editorRows } from './editorRows'
import { isCertificateLink } from './listingView'

// ── A food place's Kosher box, as Kosher certification shows it (Oct 22) ────
// Drawn on artifact 2PPYvecC87w2KLNeHgYfTN (agreed Oct 21): a place opened
// on the Kosher certification page is its listing's own Kosher box, the
// listing editor's facts row headed by a hechsher (editorRows.ts): the
// hechsher, meat, dairy or parve, its certificate, what isn't kosher. What
// a list says is marked on its rows the way every job page marks them (a
// new value highlighted, a changed one with "was …", one going crossed out).
// What isn't kosher? is compared for being there or not, never by wording.

export type KosherRowMark = 'same' | 'new' | 'changed' | 'gone'
export type KosherRow = {
  /** The fields it shows: a caveat's note with its yes/no. */
  keys: string[]
  name: string
  value: string
  was?: string
  mark: KosherRowMark
}

/** The listing's Kosher box: its facts row, when a hechsher heads it;
 *  none for a category with no hechsher (a grocery's "Kosher Store"). */
export function kosherBoxFields(category: CategoryConfig): CategoryField[] {
  const row = editorRows(category, {}).find((r) => r.id === 'facts')
  return row && row.fields.some((f) => f.caveat) ? row.fields : []
}

export const kosherBoxKeys = (category: CategoryConfig): string[] => kosherBoxFields(category).map((f) => f.key)

/** A row's name, as the drawing has it: "Hechsher", "Meat, dairy or
 *  parve", "Certificate", "What isn't kosher?". */
function rowName(f: CategoryField): string {
  if (f.caveat) return 'Hechsher'
  if (isCertificateLink(f)) return 'Certificate'
  const labels = f.type === 'select' ? (f.options ?? []).map((o) => o.label) : []
  if (labels.length >= 2 && labels.length <= 3 && labels.every((l) => /^[A-Za-z]+$/.test(l))) {
    const words = labels.map((l, i) => (i > 0 && /^[A-Z][a-z]+$/.test(l) ? l.toLowerCase() : l))
    return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`
  }
  return f.label
}

const bare = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')

/** A value as its row says it. */
function said(f: CategoryField, v: unknown): string {
  if (v == null || v === '') return ''
  if (f.type === 'select' || f.type === 'tags') return selectValues(v).join(', ')
  if (f.type === 'boolean') return v === true ? 'Yes' : v === false ? 'No' : ''
  if (f.type === 'url') return bare(String(v).trim())
  return String(v).trim()
}

/** Compared without order or case: "IKC, Keystone-K" is "Keystone-K, IKC". */
function same(f: CategoryField, a: unknown, b: unknown): boolean {
  if (f.type === 'select' || f.type === 'tags') {
    const set = (v: unknown) => selectValues(v).map((x) => x.toLowerCase()).sort().join('|')
    return set(a) === set(b)
  }
  return said(f, a).toLowerCase() === said(f, b).toLowerCase()
}

/** The box's rows: the listing's now, marked by what a list says (`next`);
 *  a row neither says anything for is left out. */
export function kosherRows(category: CategoryConfig, now: Record<string, unknown>, next: Record<string, unknown> = now): KosherRow[] {
  const fields = kosherBoxFields(category)
  const flags = new Set(fields.flatMap((f) => (f.caveat ? [f.caveat.flagField] : [])))
  const notes = new Map(fields.flatMap((f) => (f.caveat ? [[f.caveat.noteField, f.caveat.flagField] as const] : [])))
  const rows: KosherRow[] = []
  // The hechsher heads the box, as drawn.
  for (const f of [...fields.filter((f) => f.caveat), ...fields.filter((f) => !f.caveat)]) {
    if (flags.has(f.key)) continue
    const a = said(f, now[f.key])
    const b = said(f, next[f.key])
    if (!a && !b) continue
    const name = rowName(f)
    const flag = notes.get(f.key)
    const keys = flag ? [f.key, flag] : [f.key]
    if (!a) rows.push({ keys, name, value: b, mark: 'new' })
    else if (!b) rows.push({ keys, name, value: a, mark: 'gone' })
    // What isn't kosher: there or not, so the listing's own words stay.
    else if (flag || same(f, now[f.key], next[f.key])) rows.push({ keys, name, value: a, mark: 'same' })
    else rows.push({ keys, name, value: b, was: a, mark: 'changed' })
  }
  return rows
}

/** The box's pill: "1 new", "2 changes", "1 off the list", else "3 updates". */
export function kosherPill(rows: readonly KosherRow[]): string {
  const lit = rows.filter((r) => r.mark !== 'same')
  const n = lit.length
  const kinds = new Set(lit.map((r) => r.mark))
  if (!n) return 'Same'
  if (kinds.size > 1) return `${n} updates`
  if (kinds.has('new')) return `${n} new`
  if (kinds.has('gone')) return `${n} off the list`
  return `${n} change${n === 1 ? '' : 's'}`
}

/** What Use this takes from a list: the rows it would change. */
export const kosherKeysToUse = (rows: readonly KosherRow[]): string[] => rows.filter((r) => r.mark !== 'same').flatMap((r) => r.keys)

/** The list's entry by a near name, from a "gone" finding's note
 *  (keystoneWatch.ts findingNote): `The list does have "Kosher City Eats"
 *  (https://…).` */
export function renamedTo(notes: readonly string[]): { name: string; url: string } | null {
  for (const n of notes) {
    const m = n.match(/The list does have "(.+?)" \((https?:\/\/[^\s)]+)\)/)
    if (m) return { name: m[1], url: m[2] }
  }
  return null
}

/** Google's line in a new place's note: "Google: open, as Rivka Cakes". */
export function googleLine(notes: readonly string[]): string | null {
  for (const n of notes) {
    const line = n.split('\n').find((l) => /^Google/.test(l.trim()))
    if (line) return line.trim().replace(/\.$/, '')
  }
  return null
}
