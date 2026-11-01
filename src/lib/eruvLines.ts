import { lineFetchUrl, missingNames, parseLineFile, sameLine, shownMap, withLineColor, type EruvLineFile } from './eruvLine'
import type { EruvMapSource } from './eruvStore'

// ── Reading the eruvim's maps (Oct 12) ──────────────────────────────────────
// The guide shows each eruv's own map, read from its file and shown as the
// eruv draws it, without what an admin chose to leave out (the user: "copy
// the lines that we care about and that way we can always stay updated").
// The nightly job reads them (eruvLineRun.ts), and an admin's save or Read
// it now; /api/eruv/maps only serves the saved copy (the user, Nov 1), so a
// visitor never sets off a read and every read has a true date. The last
// good read is kept, and shown while their site can't be reached.
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
  /** What to save, on every read, for its date: a new copy (file) if it
   *  changed, or why the read failed. */
  save: { ok: true; file: EruvLineFile | null; at: string } | { ok: false; error: string; at: string }
  /** Left-out names the file no longer has (only from a good read). */
  missing: string[] | null
}

/** What the guide shows of a saved map. The colour an admin chose is only
 *  shown: what's kept is their file. */
export function savedMap(source: Pick<EruvMapSource, 'lineLeaveOut' | 'lineHidePoints' | 'lineColor'>, file: EruvLineFile | null): EruvLineFile | null {
  return file ? shownMap(withLineColor(file, source.lineColor), source.lineLeaveOut, source.lineHidePoints) : null
}

/** One eruv's map, read now: shown from the read, or from the last good
 *  one when the read fails. */
export async function readEruvMap(
  source: Pick<EruvMapSource, 'lineUrl' | 'rawLine' | 'lineLeaveOut' | 'lineHidePoints' | 'lineColor'>,
  now: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<MapRead> {
  const at = now.toISOString()
  const read = await readLineFile(source.lineUrl, fetchImpl)
  if (!read.ok) return { map: savedMap(source, source.rawLine), save: { ok: false, error: read.error, at }, missing: null }
  const changed = !sameLine(read.file, source.rawLine)
  return { map: savedMap(source, read.file), save: { ok: true, file: changed ? read.file : null, at }, missing: missingNames(read.file, source.lineLeaveOut) }
}

/** Whether the admins should hear of these missing names: some they
 *  haven't been told of yet. */
export function newlyMissing(missing: string[], told: string[]): string[] {
  const before = new Set(told.map((n) => n.toLowerCase()))
  return missing.filter((n) => !before.has(n.toLowerCase()))
}
