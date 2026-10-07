import { lineFetchUrl, parseLineFile, sameLine, type EruvLineFile } from './eruvLine'
import { localParts } from './eruv'
import { fetchDatesInfo } from './dateZmanim'
import type { AdminEruv } from './eruvStore'

// ── Reading the eruvim's lines (Oct 7) ──────────────────────────────────────
// Once a week, on Thursday, and the day before an Erev Yom Tov: the day
// before candles. The user's call: lines change rarely, and the day people
// look is Friday. An eruv whose line has never been read is read on the
// first run. A line that differs from the approved one waits for an admin;
// the map keeps the approved one until then.

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

/** Whether tomorrow has candle lighting where the community is: today is
 *  Thursday, or the day before an Erev Yom Tov. */
export async function candlesTomorrow(place: { latitude: number; longitude: number; timezone: string }, now: Date, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const { date } = localParts(now, place.timezone)
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  const tomorrow = d.toISOString().slice(0, 10)
  try {
    const info = await fetchDatesInfo(place, tomorrow, tomorrow, fetchImpl)
    return info.zmanim[tomorrow]?.candleLighting != null
  } catch {
    // Hebcal down: fall back to the calendar's Thursday.
    return localParts(now, place.timezone).weekday === 4
  }
}

export type LineRun = { id: string; result: 'unchanged' | 'new' | 'changed' | 'waiting' | 'failed' | 'skipped'; error?: string }

/** One eruv's line read, if it's due: what to save, and whether an admin
 *  should be told (a new pending line, not one they were already told of). */
export async function runLine(
  eruv: Pick<AdminEruv, 'id' | 'lineUrl' | 'rawLine' | 'linePending' | 'lineReadAt'>,
  { due, now, fetchImpl = fetch }: { due: boolean; now: Date; fetchImpl?: typeof fetch },
): Promise<{ run: LineRun; save?: { ok: true; pending: EruvLineFile | null; at: string } | { ok: false; error: string; at: string } }> {
  if (!eruv.lineUrl || (!due && eruv.lineReadAt)) return { run: { id: eruv.id, result: 'skipped' } }
  const at = now.toISOString()
  const read = await readLineFile(eruv.lineUrl, fetchImpl)
  if (!read.ok) return { run: { id: eruv.id, result: 'failed', error: read.error }, save: { ok: false, error: read.error, at } }
  if (sameLine(read.file, eruv.rawLine)) return { run: { id: eruv.id, result: 'unchanged' }, save: { ok: true, pending: null, at } }
  if (sameLine(read.file, eruv.linePending)) return { run: { id: eruv.id, result: 'waiting' }, save: { ok: true, pending: eruv.linePending, at } }
  return { run: { id: eruv.id, result: eruv.rawLine ? 'changed' : 'new' }, save: { ok: true, pending: read.file, at } }
}
