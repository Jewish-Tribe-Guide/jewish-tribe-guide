import { isStale, localParts, pageText, readStatus, type Eruv } from './eruv'
import type { StatusWrite } from './eruvStore'
import { fetchDatesInfo } from './dateZmanim'

// ── Reading the eruvim's pages (Oct 7) ──────────────────────────────────────
// On demand: /api/eruv reads any page whose last read is older than the
// window (eruv.ts staleAfterMs: 15 minutes on Friday afternoon, 3 hours
// otherwise) before it answers, so what a visitor sees is never older than
// that. No cron needed; each page is read at most once per window however
// many people look.

const TIMEOUT_MS = 8000
const USER_AGENT = 'Mozilla/5.0 (compatible; PhillyJewishGuide/1.0; eruv status)'

/** One page's status, or why it couldn't be read. */
export async function readEruvPage(url: string, now: Date, fetchImpl: typeof fetch = fetch): Promise<StatusWrite> {
  const at = now.toISOString()
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
    if (!res.ok) return { ok: false, error: `The page answered ${res.status}`, at }
    const reading = readStatus(pageText(await res.text()))
    if (reading.status === 'unknown') return { ok: false, error: reading.words ? `Unclear: “${reading.words}”` : 'No status sentence on the page', at }
    return { ok: true, status: reading.status, words: reading.words, postedOn: reading.postedOn, at }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), at }
  }
}

/** Today's candle lighting where the community is, in minutes from
 *  midnight; null when there's none today, or Hebcal can't be reached. */
export async function candlesToday(place: { latitude: number; longitude: number; timezone: string }, now: Date, fetchImpl: typeof fetch = fetch): Promise<number | null> {
  const { date } = localParts(now, place.timezone)
  try {
    const info = await fetchDatesInfo(place, date, date, fetchImpl)
    return info.zmanim[date]?.candleLighting ?? null
  } catch {
    return null
  }
}

/** The eruvim with every stale page read again, each read saved. Reads run
 *  side by side; a save that fails is logged and the read still shown. */
export async function refreshStale(
  eruvim: Eruv[],
  { now, timezone, candles, save, fetchImpl = fetch }: { now: Date; timezone: string; candles: number | null; save: (id: string, read: StatusWrite) => Promise<void>; fetchImpl?: typeof fetch },
): Promise<Eruv[]> {
  return Promise.all(
    eruvim.map(async (e) => {
      if (!e.statusUrl || !isStale(e, now, timezone, candles)) return e
      const read = await readEruvPage(e.statusUrl, now, fetchImpl)
      await save(e.id, read).catch((err) => console.error(`[eruv] couldn't save ${e.id}:`, err))
      return read.ok
        ? { ...e, status: read.status, statusWords: read.words, statusPostedOn: read.postedOn, statusCheckedAt: read.at, statusError: null }
        : { ...e, statusErrorAt: read.at, statusError: read.error }
    }),
  )
}
