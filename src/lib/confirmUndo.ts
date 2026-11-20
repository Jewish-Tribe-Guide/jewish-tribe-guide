import { createHmac, timingSafeEqual } from 'node:crypto'

// ── Undoing a "Still right?" Yes (Nov 20, the health sweep) ─────────────────
// The undo used to put back whatever date the browser sent as the one before
// the Yes. The date being undone is public (it's on the listing), so anyone
// could send it with a date from years ago, or none, and make any listing
// look long unchecked, or never checked at all.
//
// Now the server writes down the date before the Yes itself, when the Yes is
// saved, and hands the browser this note of it, signed. The undo sends the
// note back; the server checks its own signature and restores only what it
// wrote. A note is good for one listing (and box), one Yes, and a day.
//
// Signed with a key derived from the service-role key: secret, already on
// every server the site runs on, and never in a browser.

/** How long an undo stays possible: the same day the activity log's own
 *  undo allows (removeVisitorActivity). */
export const UNDO_TTL_MS = 24 * 60 * 60 * 1000

export type UndoNote = {
  /** The listing. */
  id: string
  /** The box ("womenTevillah"), or null for the whole listing. */
  section: string | null
  /** The date the Yes set: the undo happens only if the listing still has it. */
  at: string
  /** The date before the Yes, or null when there was none. */
  prev: string | null
  /** When the note stops working (ms since the epoch). */
  exp: number
}

function key(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY')
  return `confirm-undo\0${secret}`
}

const sign = (body: string) => createHmac('sha256', key()).update(body).digest('base64url')

/** The signed note the browser keeps and sends back to undo. */
export function signUndo(note: Omit<UndoNote, 'exp'>, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...note, exp: now + UNDO_TTL_MS })).toString('base64url')
  return `${body}.${sign(body)}`
}

/** The note, if it's one this server signed, for this listing and box, and
 *  still in date. Null for anything else. */
export function readUndo(token: unknown, id: string, section: string | null, now = Date.now()): UndoNote | null {
  if (typeof token !== 'string' || token.length > 2_000) return null
  const [body, mac, extra] = token.split('.')
  if (!body || !mac || extra !== undefined) return null
  const want = Buffer.from(sign(body))
  const got = Buffer.from(mac)
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null
  let note: UndoNote
  try {
    note = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as UndoNote
  } catch {
    return null
  }
  if (note.id !== id || (note.section ?? null) !== section) return null
  if (typeof note.exp !== 'number' || note.exp < now) return null
  if (typeof note.at !== 'string' || (note.prev !== null && typeof note.prev !== 'string')) return null
  return note
}
