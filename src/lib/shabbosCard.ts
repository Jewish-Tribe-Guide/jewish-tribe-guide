import { resolvePrimaryZmanimBlock } from './zmanim'
import type { ZmanEntry, ZmanimData } from '@/types'

// ── The Shabbos card: one big time ───────────────────────────────────────────
// The card answers "when?" with one number, the next thing to happen: candle
// lighting until it's lit, then havdalah; a Yom Tov's next candle lighting,
// then its end; a fast's start, then its end. The rest of the period's times
// sit under it, smaller, so they're still there to read. Which period the
// card is about (fast, Yom Tov or Shabbos) is resolvePrimaryZmanimBlock's
// call, unchanged.

export type CardTime = { label: string; when: string; time: string; iso?: string }

export type ShabbosCardView = {
  kind: 'fast' | 'holiday' | 'shabbos'
  /** "Shabbos", "Shmini Atzeret", "Tzom Gedaliah". */
  name: string
  /** The next time to happen, shown big. Null only when the data has none. */
  next: CardTime | null
  /** The period's other times still worth reading, in order. */
  also: CardTime[]
}

const at = (label: string, e: ZmanEntry): CardTime => ({ label, when: e.label, time: e.time, iso: e.iso })

// A time with no instant can't be placed against the clock; treat it as
// still to come, so nothing is hidden for lack of data.
const ahead = (e: ZmanEntry | null | undefined, nowMs: number) => !!e && (!e.iso || Date.parse(e.iso) > nowMs)

export function shabbosCardView(data: ZmanimData, nowMs: number): ShabbosCardView {
  const block = resolvePrimaryZmanimBlock(data, nowMs)

  if (block === 'fast' && data.fastPeriod) {
    const { name, begins, ends } = data.fastPeriod
    const endsAt = ends ? at('Fast ends', ends) : null
    if (ahead(begins, nowMs)) return { kind: 'fast', name, next: at('Fast begins', begins), also: endsAt ? [endsAt] : [] }
    // Under way (or just over, in the grace period): its end is the news.
    // Ta'anit Bechorot has no published end, so its start stays.
    return endsAt
      ? { kind: 'fast', name, next: endsAt, also: [] }
      : { kind: 'fast', name, next: at('Fast began', begins), also: [] }
  }

  if (block === 'holiday' && data.holidayPeriod) {
    const { name, begins, candleLightings, ends } = data.holidayPeriod
    const endsAt = at('Ends', ends)
    // Before it starts, the first candle lighting; once it has, the next
    // night's, if a second day has one; then only its end is left.
    const candles = ahead(begins, nowMs) ? begins : candleLightings.find((c) => ahead(c, nowMs))
    return candles
      ? { kind: 'holiday', name, next: at('Candles', candles), also: [endsAt] }
      : { kind: 'holiday', name, next: endsAt, also: [] }
  }

  const { candleLighting, havdalah } = data.shabbos
  const havdalahAt = havdalah ? at('Havdalah', havdalah) : null
  if (candleLighting && ahead(candleLighting, nowMs)) {
    return { kind: 'shabbos', name: 'Shabbos', next: at('Candles', candleLighting), also: havdalahAt ? [havdalahAt] : [] }
  }
  return { kind: 'shabbos', name: 'Shabbos', next: havdalahAt, also: [] }
}

/** "in 2 h 54 min", "in 40 min": how soon, while it's under 12 hours off.
 *  Further than that, the day it falls on says it better. */
export function countdown(iso: string | undefined, nowMs: number): string | null {
  if (!iso) return null
  const minutes = Math.ceil((Date.parse(iso) - nowMs) / 60_000)
  if (!(minutes > 0) || minutes > 12 * 60) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `in ${m} min`
  return m === 0 ? `in ${h} h` : `in ${h} h ${m} min`
}
