import { listCategories } from './categoryStore'
import { getSiteSettings } from './siteSettingsStore'
import { listHomeSections } from './homeSectionStore'
import { listPublishedForms } from './formStore'
import { listHospitals } from './hospitalStore'
import { SITE_SETTINGS_DEFAULTS, type SiteSettings } from './siteSettings'
import { FALLBACK_CATEGORIES } from './categoryFallback'
import type { CategoryConfig } from './categories'
import type { HomeSection } from './homeSections'
import type { FormConfig } from './forms'
import type { Hospital } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Everything a public screen needs about its community, fetched on the server.
//
// This used to happen in the browser: five separate hooks, each firing its own
// request after hydration, so the first paint was always skeletons and every
// visitor paid a round trip for content that is identical for all of them.
// Prerendering the shell didn't fix that — the shell was empty. Fetching here
// means the HTML ships with the real thing.
//
// Each read is caught individually. A failure in one is recorded rather than
// thrown, for two reasons: the site should still render if (say) hospitals are
// unavailable, and — more importantly — the UI has to be able to tell "this
// failed to load" apart from "there are none of these". An empty grocery
// directory that actually means "we couldn't reach the database" is the worst
// possible answer for someone standing in a hospital deciding where to eat.
// ─────────────────────────────────────────────────────────────────────────────

export type ContentKey = 'categories' | 'settings' | 'homeSections' | 'forms' | 'hospitals'

export type CommunityContent = {
  categories: CategoryConfig[]
  settings: SiteSettings
  homeSections: HomeSection[]
  forms: FormConfig[]
  hospitals: Hospital[]
  /** Which reads failed. Anything listed here is showing a fallback, not data,
   *  and the UI should say so rather than present it as the truth. */
  failed: ContentKey[]
}

/** Runs `load`, returning `fallback` and recording the key if it throws. */
async function attempt<T>(
  key: ContentKey,
  failed: ContentKey[],
  fallback: T,
  load: () => Promise<T>,
): Promise<T> {
  try {
    return await load()
  } catch (err) {
    console.error(`[content] ${key} failed to load:`, err)
    failed.push(key)
    return fallback
  }
}

export async function loadCommunityContent(community: string): Promise<CommunityContent> {
  const failed: ContentKey[] = []

  const [categories, settings, homeSections, forms, hospitals] = await Promise.all([
    // The seeded set, so the cards never vanish entirely — the ids match the
    // real ones, so links keep working once the database is reachable again.
    attempt('categories', failed, FALLBACK_CATEGORIES, () => listCategories(community)),
    attempt('settings', failed, SITE_SETTINGS_DEFAULTS, () => getSiteSettings(community)),
    attempt<HomeSection[]>('homeSections', failed, [], () => listHomeSections(community)),
    attempt<FormConfig[]>('forms', failed, [], () => listPublishedForms(community)),
    attempt<Hospital[]>('hospitals', failed, [], () => listHospitals(community)),
  ])

  return { categories, settings, homeSections, forms, hospitals, failed }
}
