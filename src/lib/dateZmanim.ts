import type { DayZmanim } from './scheduleUpdate'

// ── Zmanim and calendar names for a run of dates ────────────────────────────
// For reading a shul's message about particular days ("Shabbos Bereishis:
// Mincha 6:12"): what each date is called (the parsha, a Yom Tov), so the
// AI can put "Shabbos Bereishis" on its date, and that date's sunset,
// candle lighting and havdalah, so 6:12 can be matched with "at candle
// lighting" (scheduleUpdate.ts). Hebcal, as the rest of the guide's zmanim
// (zmanim.ts): times come in the place's own timezone.

const HEBCAL_BASE = 'https://www.hebcal.com'
const FETCH_OPTS = { next: { revalidate: 3600 } } as RequestInit

/** "2026-10-09T18:30:00-04:00" → minutes from midnight, as Hebcal wrote it
 *  for the place's own timezone. */
function localMinutes(iso: string): number | null {
  const m = iso.match(/T(\d{2}):(\d{2})/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export type DatesInfo = {
  zmanim: Record<string, DayZmanim>
  /** "Parashat Bereshit", "Shmini Atzeret", by date. */
  names: Record<string, string[]>
}

export async function fetchDatesInfo(
  { latitude, longitude, timezone }: { latitude: number; longitude: number; timezone: string },
  from: string,
  to: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DatesInfo> {
  const geo = `latitude=${latitude}&longitude=${longitude}&tzid=${encodeURIComponent(timezone)}`
  const [zm, cal] = await Promise.all([
    fetchImpl(`${HEBCAL_BASE}/zmanim?cfg=json&${geo}&start=${from}&end=${to}`, FETCH_OPTS).then((r) => (r.ok ? r.json() : null)),
    fetchImpl(`${HEBCAL_BASE}/hebcal?cfg=json&v=1&start=${from}&end=${to}&${geo}&c=on&b=18&s=on&maj=on&min=on&mod=on&mf=on`, FETCH_OPTS).then((r) => (r.ok ? r.json() : null)),
  ])
  const zmanim: Record<string, DayZmanim> = {}
  const names: Record<string, string[]> = {}
  const sunsets = (zm as { times?: { sunset?: Record<string, string> } } | null)?.times?.sunset ?? {}
  for (const [date, iso] of Object.entries(sunsets)) {
    const m = localMinutes(iso)
    if (m !== null) zmanim[date] = { ...zmanim[date], sunset: m }
  }
  for (const item of (cal as { items?: { category: string; title: string; date: string }[] } | null)?.items ?? []) {
    const date = item.date.slice(0, 10)
    if (item.category === 'candles' || item.category === 'havdalah') {
      const m = localMinutes(item.date)
      if (m !== null) zmanim[date] = { ...zmanim[date], [item.category === 'candles' ? 'candleLighting' : 'havdalah']: m }
    } else if (item.category === 'parashat' || item.category === 'holiday' || item.category === 'roshchodesh') {
      names[date] = [...(names[date] ?? []), item.title]
    }
  }
  return { zmanim, names }
}
