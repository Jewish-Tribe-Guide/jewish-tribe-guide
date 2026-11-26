// ── A row's sticker (boards M1–M6, N2–N4, Nov 25) ───────────────────────────
// What a row of Add or a saved listing says about whether something keeps
// it current, in a word or two: "Checked nightly" or "Checked weekly" in
// green, "Not checked" in grey, "Checking…" only while a read runs, and no
// sticker where nothing could check the fact (an address, a photo). Which
// job does the checking is the opened row's source line's to say. Pure.

export type Sticker = { text: 'Checked nightly' | 'Checked weekly' | 'Not checked' | 'Checking…'; tone: 'green' | 'grey' }

/** What a line's read has left it as: still reading, read and nothing
 *  kept from it (no times on the page, no email yet), or found and waiting
 *  for a person to use it (no sticker till then: nothing keeps it yet). */
export type LineState = 'checking' | 'unchecked' | 'waiting'

/** Jobs that run once a week, not every night: the link check on Sundays,
 *  and an email, which comes when the shul sends it. */
const WEEKLY = new Set(['Link check', 'Email'])

export function stickerOf(source: { job: string; amber: boolean; unchecked?: boolean; lines?: { text: string; state?: LineState }[] }): Sticker | null {
  const lines = (source.lines ?? []).filter((l) => l.text)
  if (lines.some((l) => l.state === 'checking')) return { text: 'Checking…', tone: 'grey' }
  if (lines.some((l) => l.state === 'waiting')) return null
  if (source.amber || source.unchecked || (lines.length > 0 && lines.every((l) => l.state === 'unchecked'))) return { text: 'Not checked', tone: 'grey' }
  return { text: WEEKLY.has(source.job) ? 'Checked weekly' : 'Checked nightly', tone: 'green' }
}
