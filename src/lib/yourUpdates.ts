// "Your updates" on You (Nov 27, board S4c, docs/add-rethink.md): what this
// phone sent, kept by id so You can ask whether each is live yet. No
// account: the ids /api/submissions, /api/message/send and
// /api/message/queue already answer with, in this browser's storage. Only
// this phone and browser see them (Safari forgets a site's storage after
// about a week unused unless it's installed), which is why the thank-you
// still offers an email.
//
// A post sent with the box (`message`) is one id that the read later turns
// into suggestions (sent_message.submission_ids); everything else is a
// suggestion's own id (`submission`).

export type UpdateKind = 'message' | 'submission'

export type YourUpdate = {
  kind: UpdateKind
  id: string
  /** The place, or the first words of a post. */
  name: string
  /** What it was: "New place", "Changes", "Post". */
  what: string
  /** When it was sent, ms. */
  at: number
}

const KEY = (community: string) => `jpc:your-updates:${community}`
/** Kept this long, and this many: an old update is news to no one. */
export const KEEP_MS = 90 * 24 * 60 * 60 * 1000
export const KEEP_MAX = 30

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Sent when one is added, so You's list and dot see it at once. */
export const UPDATES_EVENT = 'jpc:your-updates'

export function loadUpdates(community: string, now = Date.now()): YourUpdate[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(community)) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter(
      (u): u is YourUpdate =>
        !!u && (u.kind === 'message' || u.kind === 'submission') && typeof u.id === 'string' && UUID.test(u.id) && typeof u.name === 'string' && typeof u.what === 'string' && typeof u.at === 'number' && now - u.at < KEEP_MS,
    )
  } catch {
    return []
  }
}

/** Keeps what was just sent, newest first. Ids that aren't real (a
 *  honeypot's "ok", a preview's) are left out. */
export function recordUpdates(community: string, kind: UpdateKind, ids: readonly unknown[], name: string, what: string, now = Date.now()): void {
  const fresh = ids.filter((id): id is string => typeof id === 'string' && UUID.test(id)).map((id) => ({ kind, id, name: name.trim() || 'Your update', what, at: now }))
  if (fresh.length === 0) return
  try {
    const kept = loadUpdates(community, now).filter((u) => !fresh.some((f) => f.id === u.id))
    localStorage.setItem(KEY(community), JSON.stringify([...fresh, ...kept].slice(0, KEEP_MAX)))
    window.dispatchEvent(new Event(UPDATES_EVENT))
  } catch {
    // Best-effort: without storage, You just has no list.
  }
}

/** A post's name on the list: its first words. */
export function postName(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t) return 'Your photo'
  return t.length > 40 ? `${t.slice(0, 39).trimEnd()}…` : t
}

export type UpdateStatus =
  | { state: 'waiting' }
  /** On the site: where, and when an admin approved it. */
  | { state: 'live'; href: string | null; at: string }
  | { state: 'not_changed' }

/** An update that went live after You was last opened here: the dot.
 *  Unlike a saved place's change, it counts before You was ever opened:
 *  the sender is waiting for exactly this. */
export function hasLiveNews(statuses: Readonly<Record<string, UpdateStatus>>, since: number | null): boolean {
  return Object.values(statuses).some((s) => s.state === 'live' && Date.parse(s.at) > (since ?? 0))
}
