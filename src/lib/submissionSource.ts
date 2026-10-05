import { GOOGLE_SUBMITTER_NAME } from './activity'
import { KEYSTONE_WATCH_NAME } from './keystoneWatch'

// Where a suggestion came from, for the moderation queue (agreed Oct 5,
// canvas QList/QOpen): every card says it, an AI-read one is labelled "Read
// by AI", and an opened card shows the original beside the change so the
// admin checks one against the other instead of approving a diff blind.
//
// Today the original travels in the submission's `note`, in the formats the
// filers already write (the shul card's paste/photo reader, the Keystone-K
// watch, the Google sync). A filer that knows more can say it outright in
// `payload.source`; only the site's own server routes set that, and the
// public submissions route strips it, so a visitor can't label their own
// edit "Read by AI" or attach someone else's original.

export type SubmissionSource = {
  /** Who turned the original into the change. */
  readBy: 'ai' | 'automatic' | 'person'
  /** Where it came from, as the card says it: "from what they pasted". */
  from: string
  /** The words it was read from. */
  original?: string
  /** A photo or PDF it was read from, in the guide's own storage. */
  photoUrl?: string
  /** Anything said with it: the person's own note, or the reader's summary. */
  note?: string
}

type SourceInput = {
  note: string | null
  submitted_by: { name?: string; email?: string } | null
  payload: Record<string, unknown>
}

const PASTED = 'Read from what they pasted:\n'
const PHOTO = 'Read from their photo or PDF: '

/** A filer's own statement of where a suggestion came from, if it made a
 *  well-formed one. */
export function statedSource(payload: Record<string, unknown> | null | undefined): SubmissionSource | null {
  const s = payload?.source
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null
  const r = s as Record<string, unknown>
  if (r.readBy !== 'ai' && r.readBy !== 'automatic' && r.readBy !== 'person') return null
  if (typeof r.from !== 'string' || !r.from.trim()) return null
  const text = (k: string) => (typeof r[k] === 'string' && (r[k] as string).trim() ? (r[k] as string) : undefined)
  return {
    readBy: r.readBy,
    from: r.from.trim(),
    ...(text('original') ? { original: text('original') } : {}),
    ...(text('photoUrl') ? { photoUrl: text('photoUrl') } : {}),
    ...(text('note') ? { note: text('note') } : {}),
  }
}

export function submissionSource(s: SourceInput): SubmissionSource {
  const stated = statedSource(s.payload)
  if (stated) return stated
  const note = s.note?.trim() || undefined
  const by = s.submitted_by?.name

  if (by === KEYSTONE_WATCH_NAME) return { readBy: 'automatic', from: 'Keystone-K’s list', ...(note ? { original: note } : {}) }
  if (by === GOOGLE_SUBMITTER_NAME) return { readBy: 'automatic', from: 'Google', ...(note ? { original: note } : {}) }

  if (note && (note.includes(PASTED) || note.includes(PHOTO))) {
    const pastedAt = note.indexOf(PASTED)
    const photoAt = note.indexOf(PHOTO)
    const firstMarker = Math.min(...[pastedAt, photoAt].filter((i) => i >= 0))
    const summary = note.slice(0, firstMarker).trim()
    const original =
      pastedAt >= 0 ? note.slice(pastedAt + PASTED.length, photoAt > pastedAt ? photoAt : undefined).trim() : ''
    const photoUrl = photoAt >= 0 ? note.slice(photoAt + PHOTO.length).split(/\s/)[0] : ''
    return {
      readBy: 'ai',
      from: original ? 'what they pasted' : 'their photo',
      ...(original ? { original } : {}),
      ...(photoUrl ? { photoUrl } : {}),
      ...(summary ? { note: summary } : {}),
    }
  }

  return { readBy: 'person', from: 'a visitor', ...(note ? { note } : {}) }
}

// ── Times in the original ──────────────────────────────────────────────────
// The one omission check kept from the Oct 4 designs: every clock time in
// the original is marked used (it's somewhere in the proposed listing) or
// not used. A time the reader skipped shows up amber, so a missed minyan
// is visible without re-reading the whole email against the form.

const CLOCK = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])|\b([01]?\d|2[0-3]):([0-5]\d)\b/gi

function minutesOf(m: RegExpExecArray): number | null {
  if (m[3]) {
    let h = Number(m[1])
    const min = m[2] ? Number(m[2]) : 0
    if (h < 1 || h > 12 || min > 59) return null
    const pm = m[3].toLowerCase().startsWith('p')
    if (pm && h !== 12) h += 12
    if (!pm && h === 12) h = 0
    return h * 60 + min
  }
  return Number(m[4]) * 60 + Number(m[5])
}

/** Every clock time written anywhere in a value (a listing's details, a
 *  minyan list), as minutes since midnight. */
export function timesIn(value: unknown): Set<number> {
  const out = new Set<number>()
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(CLOCK)) {
        const t = minutesOf(m as RegExpExecArray)
        if (t !== null) out.add(t)
      }
    } else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(value)
  return out
}

export type MarkedPart = { text: string; mark?: 'used' | 'unused' }

/** The original, split so each clock time in it carries whether the
 *  proposal uses it. Only clock times are marked: "15 min before sunset"
 *  has no fixed time to look for. */
export function markTimes(original: string, proposal: unknown): { parts: MarkedPart[]; unused: number } {
  const used = timesIn(proposal)
  const parts: MarkedPart[] = []
  let unused = 0
  let last = 0
  for (const m of original.matchAll(CLOCK)) {
    const t = minutesOf(m as RegExpExecArray)
    if (t === null || m.index === undefined) continue
    if (m.index > last) parts.push({ text: original.slice(last, m.index) })
    // "Mincha 6:20" in an email means the evening one: with no AM or PM
    // written, either half of the day counts.
    const bare = !m[3] && t >= 60 && t < 13 * 60
    const mark = used.has(t) || (bare && used.has((t + 720) % 1440)) ? 'used' : 'unused'
    if (mark === 'unused') unused++
    parts.push({ text: m[0], mark })
    last = m.index + m[0].length
  }
  if (last < original.length) parts.push({ text: original.slice(last) })
  return { parts, unused }
}

/** Payload keys only the site's own server code may set: where a
 *  suggestion came from, and an admin's fixes to it. Stripped from
 *  anything a visitor posts. */
export const SERVER_ONLY_PAYLOAD_KEYS = ['source', 'reviewEdit'] as const
