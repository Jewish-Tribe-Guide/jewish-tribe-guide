import type { CategoryConfig, CategoryKind } from './categories'

// The Map and Candle Lighting: screens of the site rather than lists of
// places, so an admin switches each on or off and that's all — neither has
// anything worth changing (the user, Nov 3: the Map's name and photos showed
// nowhere, its zoom radius is set once; Candle Lighting looks the same
// everywhere). Each is still a `category` row underneath, which is what the
// public site reads (a Map tab shows when the Map's row does). No row and a
// hidden row both read as off. Jewish Medical Resources isn't offered: the
// hospitals took its place (the user, Oct 31).
//
// The Eruv is switched the same way but sits in the category list with the
// others (Nov 3), since its screen holds the eruvim and their maps.

export type SiteScreen = { kind: Extract<CategoryKind, 'map' | 'zmanim' | 'eruv'>; label: string; icon: string }

export const SITE_SCREENS: readonly SiteScreen[] = [
  { kind: 'map', label: 'Map', icon: '🗺️' },
  { kind: 'zmanim', label: 'Candle Lighting & Zmanim', icon: '🕯️' },
]

export const ERUV_SCREEN: SiteScreen = { kind: 'eruv', label: 'Eruv', icon: '🧵' }

/** A screen, its row if it has one, and whether it's on. */
export function screenState(categories: readonly CategoryConfig[], screen: SiteScreen) {
  const row = categories.find((c) => c.kind === screen.kind)
  return { screen, row, on: !!row && row.active !== false }
}

/** Each switched screen, its row if it has one, and whether it's on. */
export function siteScreenState(categories: readonly CategoryConfig[]) {
  return SITE_SCREENS.map((screen) => screenState(categories, screen))
}
