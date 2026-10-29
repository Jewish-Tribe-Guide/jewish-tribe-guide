// To do's "Set up your guide" (the admin redesign's board "Setup"): the four
// things a new community's guide needs before it's ready, each ticked off
// by what's actually saved, never by a box someone checks. Shown on To do
// until all four are done, then never again; the nav's count takes in the
// ones left. The board's fifth, "Kosher lists to watch", is left out: a new
// community has no way to add a list yet (only Keystone-K and Mekor are
// read), so it could never be ticked.

import { defaultHeroSplit } from './siteSettings'

/** What's saved, as GET /api/admin/setup reads it. */
export type SetupState = {
  /** The header has a logo (the name is given when the community is made). */
  logo: boolean
  /** How many can sign in to this community's admin. */
  admins: number
  /** Categories, and places on the site in any of them. */
  categories: number
  places: number
  /** The home page's big line has been saved for this community, not left
   *  to the starting copy. */
  heroWords: boolean
}

export type SetupStep = { key: string; name: string; line: string; href: string; done: boolean }

export function setupSteps(s: SetupState, base: string): SetupStep[] {
  return [
    { key: 'name', name: 'Name and logo', line: 'The name at the top, and its logo', href: `${base}/community`, done: s.logo },
    { key: 'admins', name: 'A second admin', line: 'Someone to share the deciding', href: `${base}/team`, done: s.admins >= 2 },
    {
      key: 'category',
      name: 'Your first category',
      line: s.categories === 0 ? 'Pick a kind, then add its places' : 'Add its places',
      // Made but empty: its places are added from Places.
      href: s.categories === 0 ? `${base}/categories/cat:new` : `${base}/places`,
      done: s.categories > 0 && s.places > 0,
    },
    { key: 'words', name: 'The home page’s words', line: 'The big line and the line under it', href: `${base}/home`, done: s.heroWords },
  ]
}

/** Whether the home page's big line and the line under it are someone's
 *  own. Any first save of the settings writes the whole row, the starting
 *  words with it (split from the community's mission), so a row with words
 *  in it isn't enough: they have to differ from that. */
export function ownHeroWords(saved: { headline: string | null; subhead: string | null } | null, mission: string): boolean {
  const headline = saved?.headline?.trim() ?? ''
  if (!headline) return false
  const start = defaultHeroSplit(mission)
  return headline !== start.headline || (saved?.subhead?.trim() ?? '') !== start.subhead
}

/** How many of the four are left; 0 once the guide is set up. */
export function setupLeft(s: SetupState | null): number {
  return s ? setupSteps(s, '').filter((step) => !step.done).length : 0
}
