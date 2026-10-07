import type { EruvEdit } from './eruvStore'

// What an admin may set on an eruv, checked: text trimmed and kept short,
// addresses that are web addresses, an order that's a number. Anything
// else in the body is ignored.

const TEXT: Record<string, number> = { name: 120, covers: 600, hotline: 60 }
const URLS = ['website', 'alertsUrl', 'statusUrl', 'lineUrl'] as const

function url(v: unknown): string | null | undefined {
  if (v === null || v === '') return null
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  if (!t) return null
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`
  try {
    const u = new URL(withScheme)
    return u.hostname.includes('.') ? u.toString() : undefined
  } catch {
    return undefined
  }
}

export function readEruvEdit(raw: unknown): { ok: true; edit: EruvEdit } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Nothing to save.' }
  const r = raw as Record<string, unknown>
  const edit: EruvEdit = {}
  for (const [k, max] of Object.entries(TEXT)) {
    if (!(k in r)) continue
    const v = typeof r[k] === 'string' ? (r[k] as string).trim().slice(0, max) : ''
    if (k === 'name' && !v) return { ok: false, error: 'The eruv needs a name.' }
    ;(edit as Record<string, unknown>)[k] = v || null
  }
  for (const k of URLS) {
    if (!(k in r)) continue
    const v = url(r[k])
    if (v === undefined) return { ok: false, error: `That isn’t a web address: ${String(r[k])}` }
    edit[k] = v
  }
  if ('statusDated' in r) edit.statusDated = r.statusDated === true
  if ('active' in r) edit.active = r.active !== false
  if ('sortOrder' in r) {
    const n = Number(r.sortOrder)
    if (!Number.isFinite(n)) return { ok: false, error: 'The order must be a number.' }
    edit.sortOrder = Math.round(n)
  }
  if ('lineLeaveOut' in r) {
    if (!Array.isArray(r.lineLeaveOut)) return { ok: false, error: 'Leave out must be a list.' }
    edit.lineLeaveOut = [...new Set(r.lineLeaveOut.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean))].slice(0, 50)
  }
  return { ok: true, edit }
}

/** "Center City Eruv" → "center-city". */
export function eruvIdFor(name: string): string {
  return name
    .toLowerCase()
    .replace(/\beruv\b/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** Which readings an edit throws away: a new status page or line address
 *  starts afresh, since the old reading was of the old page. The admin tab
 *  sends every field on each save, so an address only counts as new when
 *  it differs from the stored one; otherwise ticking a line piece off
 *  would also throw away the line waiting for a yes. */
export function readingsToReset(edit: EruvEdit, stored: { statusUrl: string | null; lineUrl: string | null }): { status: boolean; line: boolean } {
  return {
    status: 'statusUrl' in edit && (edit.statusUrl ?? null) !== stored.statusUrl,
    line: 'lineUrl' in edit && (edit.lineUrl ?? null) !== stored.lineUrl,
  }
}
