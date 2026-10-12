import { lineFetchUrl, missingNames, parseLineFile, sameLine, shownMap, type EruvLineFile } from './eruvLine'
import type { EruvMapSource } from './eruvStore'

// ── Reading the eruvim's maps (Oct 12) ──────────────────────────────────────
// The guide shows each eruv's own map, read from its file and shown as the
// eruv draws it, without what an admin chose to leave out (the user: "copy
// the lines that we care about and that way we can always stay updated").
// /api/eruv/maps reads them, and the CDN keeps that for an hour, so a
// change to an eruv's map shows within the hour with nobody checking it.
// The last good read is kept, and shown while their site can't be reached.
//
// The one thing an admin hears about (the daily check, eruvLineRun.ts): a
// part they left out that the file no longer has. The eruv renamed or
// removed it, so whatever took its place is showing.

const TIMEOUT_MS = 15_000

export async function readLineFile(url: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: true; file: EruvLineFile } | { ok: false; error: string }> {
  try {
    const res = await fetchImpl(lineFetchUrl(url), { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
    if (!res.ok) return { ok: false, error: `The map answered ${res.status}` }
    return { ok: true, file: parseLineFile(await res.text()) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export type MapRead = {
  /** What the guide shows: the eruv's map without what was left out; null
   *  when it has never been read. */
  map: EruvLineFile | null
  /** What to save: a new copy (file), or why the read failed. Nothing when
   *  the map is as it was. */
  save?: { ok: true; file: EruvLineFile | null; at: string } | { ok: false; error: string; at: string }
  /** Left-out names the file no longer has (only from a good read). */
  missing: string[] | null
}

/** One eruv's map, read now: shown from the read, or from the last good
 *  one when the read fails. */
export async function readEruvMap(source: Pick<EruvMapSource, 'lineUrl' | 'rawLine' | 'lineLeaveOut' | 'lineHidePoints'>, now: Date, fetchImpl: typeof fetch = fetch): Promise<MapRead> {
  const at = now.toISOString()
  const read = await readLineFile(source.lineUrl, fetchImpl)
  const show = (file: EruvLineFile | null) => (file ? shownMap(file, source.lineLeaveOut, source.lineHidePoints) : null)
  if (!read.ok) return { map: show(source.rawLine), save: { ok: false, error: read.error, at }, missing: null }
  const changed = !sameLine(read.file, source.rawLine)
  return { map: show(read.file), save: changed ? { ok: true, file: read.file, at } : undefined, missing: missingNames(read.file, source.lineLeaveOut) }
}

/** Whether the admins should hear of these missing names: some they
 *  haven't been told of yet. */
export function newlyMissing(missing: string[], told: string[]): string[] {
  const before = new Set(told.map((n) => n.toLowerCase()))
  return missing.filter((n) => !before.has(n.toLowerCase()))
}
