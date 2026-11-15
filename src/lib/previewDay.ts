import type { ZmanimData } from '@/types'
import { shabbosMoment } from '@/lib/todayHome'

// ── Seeing Right now on another day, in the admin's preview (Nov 15) ────────
// The user: "is there a way to see on admin what right now would show on
// other days?" On the Right Now screen, clicking one of its three parts
// (Saturday night to Thursday, Friday until candles, candles to havdalah)
// shows the preview on that day; it stays while the admin is on Home page.
// Only the preview's Right now moves its clock: the day rides in the preview
// draft (previewDraft.ts), which only a ?preview=1 page reads.

export type PreviewDay = 'weekday' | 'erev' | 'shabbos'

export const PREVIEW_DAY_WORDS: Record<PreviewDay, string> = { weekday: 'A weekday', erev: 'Friday', shabbos: 'Shabbos' }

const HOUR = 60 * 60 * 1000

/** A time in this week that is the asked-for day, from the week's own
 *  candles and havdalah: Friday three hours before candles, Shabbos three
 *  hours before havdalah, a weekday three days before candles. `now`
 *  when it's that day already, or when the week's times can't say. */
export function previewNow(day: PreviewDay | null, zmanim: ZmanimData | null, now: number, timezone: string): number {
  if (!day || !zmanim) return now
  if (shabbosMoment(zmanim, now, timezone).kind === day) return now
  const candles = zmanim.shabbos.candleLighting?.iso ? Date.parse(zmanim.shabbos.candleLighting.iso) : null
  const havdalah = zmanim.shabbos.havdalah?.iso ? Date.parse(zmanim.shabbos.havdalah.iso) : null
  const at = day === 'erev' ? (candles ? candles - 3 * HOUR : null) : day === 'shabbos' ? (havdalah ? havdalah - 3 * HOUR : null) : candles ? candles - 72 * HOUR : null
  // A Yom Tov in the week can make that time something else: then stay put.
  return at !== null && shabbosMoment(zmanim, at, timezone).kind === day ? at : now
}
