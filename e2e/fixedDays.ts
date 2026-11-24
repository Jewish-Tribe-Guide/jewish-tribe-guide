import type { Page } from '@playwright/test'

// ─────────────────────────────────────────────────────────────────────────────
// A fixed moment on each kind of day, for tests whose page changes with the
// day (Right now, the candles card): Friday Oct 16, 2026 in Philadelphia,
// candles 6:01 PM, havdalah Saturday 6:59 PM, as Hebcal gives them.
//
// /api/zmanim answers for the real today, so it's stood in for as well as
// the clock. A test using these needs `serviceWorkers: 'block'`: once the
// worker controls the page it fetches /api/zmanim itself, where page.route
// can't stand in for it.
// ─────────────────────────────────────────────────────────────────────────────

export const ZMANIM = {
  hebrewDate: '2 Cheshvan 5787',
  parsha: 'Parashat Noach',
  dailyZmanim: [{ label: 'Sunset', time: '6:18 PM' }],
  shabbos: {
    candleLighting: { label: 'Friday', time: '6:01 PM', iso: '2026-10-16T18:01:00-04:00' },
    havdalah: { label: 'Saturday', time: '6:59 PM', iso: '2026-10-17T18:59:00-04:00' },
  },
}

export const DAYS = {
  tuesday: { at: '2026-10-13T12:30:00-04:00', zmanim: { ...ZMANIM, dayOfWeek: 2, isFriday: false, isShabbos: false } },
  friday: { at: '2026-10-16T13:30:00-04:00', zmanim: { ...ZMANIM, hebrewDate: '5 Cheshvan 5787', dayOfWeek: 5, isFriday: true, isShabbos: false } },
  shabbos: { at: '2026-10-17T11:00:00-04:00', zmanim: { ...ZMANIM, hebrewDate: '6 Cheshvan 5787', dayOfWeek: 6, isFriday: false, isShabbos: true } },
}

/** Makes it `day` for the page: its clock and its zmanim. Call before goto. */
export async function onDay(page: Page, day: keyof typeof DAYS) {
  await page.route('**/api/zmanim?**', (route) => route.fulfill({ json: { ok: true, data: DAYS[day].zmanim } }))
  await page.clock.setFixedTime(new Date(DAYS[day].at))
}
