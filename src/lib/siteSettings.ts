import { community } from '@/community.config'

// ─────────────────────────────────────────────────────────────────────────────
// Site settings types.
//
// The admin-editable slice of on-page branding text — everything else in
// community.config.ts (region, timezone, feature flags, theme color) stays
// code-only. Server code reads/writes via siteSettingsStore.ts; client code
// fetches via GET /api/site-settings (see useSiteSettings.ts).
//
// NOTE: the browser tab <title>, the search-engine meta description, and the
// PWA manifest (src/app/layout.tsx, src/app/manifest.ts) are computed at
// build/module-load time straight from community.config.ts — they do NOT
// pick up edits made here. Making those dynamic would mean converting them to
// an async, per-request lookup; out of scope for now.
// ─────────────────────────────────────────────────────────────────────────────

export type SiteSettings = {
  /** Site name — the header title, footer name, and copyright line. */
  name: string
  /** Shown under the site name in the header. */
  tagline: string
  /** The big heading on the home screen, e.g. "What are you looking for?". */
  heroTitle: string
  /** Shown under the home screen heading, and reused as the footer blurb. */
  mission: string
  /** A pasted image URL shown in the header instead of the built-in Star of
   *  David mark. Null/empty keeps the default mark. */
  logoUrl: string | null
  /** Whether the footer's "Send feedback" button/form is shown at all. */
  feedbackEnabled: boolean
  /** The footer link text that opens the feedback form (an arrow is appended
   *  in the UI, no need to include one here). */
  feedbackButtonLabel: string
  /** The feedback modal's heading. */
  feedbackHeading: string
  /** Shown after a successful feedback submission. */
  feedbackSuccessMessage: string
  /** Desktop home screen only — the three cards shown between the search box
   *  and the map, as ordered CardDef ids (category slugs, or fixed ids like
   *  'support'). Empty falls back to the first three cards the home sections
   *  list, so this never has to be configured for the row to look right.
   *  Mobile's home screen shows the full grid and ignores this. */
  featuredCardIds: string[]
  /** Mobile only — the bottom tab bar, in order. Empty falls back to
   *  DEFAULT_MOBILE_TABS, so this never has to be configured. Desktop has no
   *  tab bar and ignores this entirely. */
  mobileTabs: MobileTabConfig[]
}

/** One entry in the mobile bottom tab bar. */
export type MobileTabConfig = {
  /** Stable key — kept across renames/reorders so React doesn't remount the
   *  tab (and so a rename can't silently read as "removed then added"). */
  id: string
  /** The text under the icon. */
  label: string
  /** Where the tab goes. The three built-in screens are 'categories', 'map',
   *  and 'feedback'; any other value is a CardDef id (a category slug, or a
   *  form id like 'support') and opens exactly what tapping that card on the
   *  home screen opens. */
  target: string
}

/** The built-in targets, which behave differently from card targets: they're
 *  whole app screens rather than one category, and two of them are gated on
 *  site config (a Map category existing, feedback being enabled). */
export const BUILT_IN_TAB_TARGETS = ['categories', 'map', 'feedback'] as const
export type BuiltInTabTarget = (typeof BUILT_IN_TAB_TARGETS)[number]

export function isBuiltInTabTarget(target: string): target is BuiltInTabTarget {
  return (BUILT_IN_TAB_TARGETS as readonly string[]).includes(target)
}

/** A phone's bottom bar stops being scannable past five items — the labels
 *  shrink to nothing and the touch targets start crowding each other. Enforced
 *  in the admin editor and defended again on read. */
export const MAX_MOBILE_TABS = 5

/** What the tab bar has always been, as data — the fallback whenever nothing
 *  has been configured. */
export const DEFAULT_MOBILE_TABS: MobileTabConfig[] = [
  { id: 'categories', label: 'Categories', target: 'categories' },
  { id: 'map', label: 'Map', target: 'map' },
  { id: 'feedback', label: 'Feedback', target: 'feedback' },
]

/** How many cards the desktop home screen features above the map. Shared by
 *  the fallback logic and the admin picker so the two can't drift. */
export const FEATURED_CARD_COUNT = 3

export const DEFAULT_HERO_TITLE = 'What are you looking for?'

export const DEFAULT_FEEDBACK_BUTTON_LABEL = 'Have general feedback about the site? Send a note'
export const DEFAULT_FEEDBACK_HEADING = 'Send feedback'
export const DEFAULT_FEEDBACK_SUCCESS_MESSAGE = 'We appreciate your feedback and will take it into account.'

/** The code-configured defaults — used as the client fallback (if the API is
 *  unreachable) and whenever no row exists yet in `site_settings`. */
export const SITE_SETTINGS_DEFAULTS: SiteSettings = {
  name: community.name,
  tagline: community.tagline,
  heroTitle: DEFAULT_HERO_TITLE,
  mission: community.mission,
  logoUrl: null,
  feedbackEnabled: true,
  feedbackButtonLabel: DEFAULT_FEEDBACK_BUTTON_LABEL,
  feedbackHeading: DEFAULT_FEEDBACK_HEADING,
  feedbackSuccessMessage: DEFAULT_FEEDBACK_SUCCESS_MESSAGE,
  featuredCardIds: [],
  mobileTabs: DEFAULT_MOBILE_TABS,
}

/** A short token that changes whenever the logo does.
 *
 *  The icon endpoints (/icons/192, /icons/512, …) render from the admin's
 *  uploaded logo, and their URLs never varied — so uploading a new logo left
 *  every cache in the chain serving the old picture: the CDN for an hour under
 *  the route's own Cache-Control, and a phone's home screen indefinitely,
 *  since an OS bakes that icon in when the site is added and has no reason to
 *  refetch a URL that hasn't changed. Which is exactly what happened: the new
 *  logo appeared on the site immediately and the home-screen icon stayed the
 *  old one.
 *
 *  Appending this to the icon URLs makes a new logo a new URL, so nothing can
 *  serve a stale one. Derived from the URL rather than random, so it's stable
 *  across builds and requests — a value that changed per deploy would defeat
 *  the caching entirely. */
export function iconVersion(logoUrl: string | null | undefined): string {
  const value = logoUrl?.trim()
  if (!value) return '0'
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}
