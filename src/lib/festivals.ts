import { readHebcalDay, type CalendarDay } from './jewishDays'

// ── The year's festivals, for a shul's special schedule (step 4) ─────────────
// Adding a schedule starts from the festival it's for: "Sukkos 5787, Sep 26
// – Oct 4", with each of its days named ("Sat Oct 3 · Shemini Atzeres"), so
// nobody types dates. Read from Hebcal's calendar for the year ahead (the
// same titles jewishDays.ts reads), one cached request.

export type Festival = {
  /** "Sukkos". */
  festival: string
  /** "Sukkos 5787". */
  name: string
  /** First and last day, YYYY-MM-DD: Yom Tov and Chol HaMoed, not Erev. */
  from: string
  to: string
  days: CalendarDay[]
}

type Item = { category: string; title: string; date: string; hdate?: string }

/** Each festival in a Hebcal response, in order: its days (Sukkos runs on
 *  through Simchas Torah), named with its Hebrew year. Days of one festival
 *  within nine days of each other are one festival: none recurs sooner. */
export function festivalsFrom(items: readonly Item[]): Festival[] {
  const out: Festival[] = []
  for (const i of [...items].sort((a, b) => a.date.localeCompare(b.date))) {
    if (i.category !== 'holiday') continue
    const facts = readHebcalDay(i.title)
    if (!facts || (!facts.yomTov && !facts.cholHamoed)) continue
    const date = i.date.slice(0, 10)
    const day: CalendarDay = { date, ...facts }
    const last = out.at(-1)
    if (last && last.festival === facts.festival && daysBetween(last.to, date) <= 9) {
      last.to = date
      last.days.push(day)
      continue
    }
    const year = i.hdate?.match(/\d{4}$/)?.[0] ?? date.slice(0, 4)
    out.push({ festival: facts.festival, name: `${facts.festival} ${year}`, from: date, to: date, days: [day] })
  }
  return out
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
}

const HEBCAL = 'https://www.hebcal.com/hebcal'

/** The festivals from two weeks back (so one under way is whole) to a year
 *  ahead, ending today or later. Server-side: Hebcal, cached six hours. */
export async function fetchFestivals(timezone: string, now = Date.now()): Promise<Festival[]> {
  const day = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
  const today = day(now)
  const url = `${HEBCAL}?cfg=json&v=1&start=${day(now - 14 * 86_400_000)}&end=${day(now + 400 * 86_400_000)}&maj=on&min=off&mod=off&s=off&mf=off&nx=off&ss=off&c=off&i=off`
  const res = await fetch(url, { next: { revalidate: 21600 } } as RequestInit)
  if (!res.ok) throw new Error(`Hebcal ${res.status}`)
  const body = (await res.json()) as { items?: Item[] }
  return festivalsFrom(body.items ?? []).filter((f) => f.to >= today)
}
