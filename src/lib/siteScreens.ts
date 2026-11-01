import type { CategoryConfig, CategoryKind } from './categories'

// The Map, Candle Lighting and Eruv: screens of the site rather than lists of
// places, so an admin switches each on or off instead of managing it as a
// category. Each is still a `category` row underneath, which is what the
// public site reads (a Map tab shows when the Map's row does). No row and a
// hidden row both read as off. Jewish Medical Resources isn't offered: the
// hospitals took its place (the user, Oct 31).

export type SiteScreen = { kind: Extract<CategoryKind, 'map' | 'zmanim' | 'eruv'>; label: string; icon: string }

export const SITE_SCREENS: readonly SiteScreen[] = [
  { kind: 'map', label: 'Map', icon: '🗺️' },
  { kind: 'zmanim', label: 'Candle Lighting & Zmanim', icon: '🕯️' },
  { kind: 'eruv', label: 'Eruv', icon: '🧵' },
]

/** Each screen, its row if it has one, and whether it's on. */
export function siteScreenState(categories: readonly CategoryConfig[]) {
  return SITE_SCREENS.map((screen) => {
    const row = categories.find((c) => c.kind === screen.kind)
    return { screen, row, on: !!row && row.active !== false }
  })
}
