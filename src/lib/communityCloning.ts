import { createCategory, listCategoriesUncached } from './categoryStore'
import { ERUV_SCREEN, SITE_SCREENS } from './siteScreens'

// A new community's own screens (the Map, Candle Lighting, the Eruv), on
// from the start. The starter pack (starterPack.ts) copies the default's
// first, when it's on; this adds whichever it didn't bring.

/** The Map, Candle Lighting and Eruv a new community starts with, on, unless
 *  what it was cloned from already gave it them. */
export async function addMissingSiteScreens(community: string): Promise<void> {
  const existing = await listCategoriesUncached(community)
  // The Eruv is listed with the categories rather than switched up top, but
  // a new community starts with it all the same.
  for (const screen of [...SITE_SCREENS, ERUV_SCREEN]) {
    if (existing.some((c) => c.kind === screen.kind)) continue
    await createCategory(community, { label: screen.label, pluralLabel: screen.label, kind: screen.kind, icon: screen.icon })
  }
}
