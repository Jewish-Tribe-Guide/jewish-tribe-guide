// To do's "Set up your guide" (the admin redesign's board "Setup"): what a
// new community's guide needs before it's ready, each ticked off by what's
// actually saved, never by a box someone checks. Shown on To do until all
// are done, then never again; the nav's count takes in the ones left.
//
// Changed Nov 25 (the user, after New community was rebuilt): the name is
// chosen when the community is made, so the first step is the logo alone;
// "The home page's words" went (the phone home has no big line, the
// computer's has no line under it, and New community writes the big line
// from the city); and the community email came in (board E1): the guide's
// own Gmail, for replies and the shuls' and eruvs' emails, which are how
// much of the schedules stay current. A second admin is last: they may all
// have been added when the community was made. The board's "Kosher lists
// to watch" is still left out: a new community has no way to add one yet.

/** What's saved, as GET /api/admin/setup reads it. */
export type SetupState = {
  /** The header has a logo. */
  logo: boolean
  /** How many can sign in to this community's admin. */
  admins: number
  /** The community email is saved and the newsletter script in it has
   *  checked in at least once: both halves of its page. */
  communityEmail: boolean
  /** The site's own address, when it has one: nothing to set up. */
  communityAddress?: string | null
  /** Categories, and places on the site in any of them. */
  categories: number
  places: number
}

export type SetupStep = { key: string; name: string; line: string; href: string; done: boolean }

export function setupSteps(s: SetupState, base: string): SetupStep[] {
  return [
    { key: 'logo', name: 'Your logo', line: 'At the top of every page', href: `${base}/home`, done: s.logo },
    { key: 'communityEmail', name: 'The community email', line: s.communityAddress ?? 'A Gmail for replies and the shuls’ and eruvs’ emails', href: `${base}/team/email`, done: s.communityEmail },
    {
      key: 'category',
      name: 'Your first category',
      line: s.categories === 0 ? 'Pick a kind, then add its places' : 'Add its places',
      // Made but empty: its places are added from Places.
      href: s.categories === 0 ? `${base}/categories/cat:new` : `${base}/places`,
      done: s.categories > 0 && s.places > 0,
    },
    { key: 'admins', name: 'A second admin', line: 'Someone to share the deciding', href: `${base}/team`, done: s.admins >= 2 },
  ]
}

/** How many are left; 0 once the guide is set up. */
export function setupLeft(s: SetupState | null): number {
  return s ? setupSteps(s, '').filter((step) => !step.done).length : 0
}
