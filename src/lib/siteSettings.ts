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
  /** The search box's placeholder text, on both devices — e.g. "Search —
   *  kosher food, mikvah, shuls, schools…". Shared rather than split per
   *  device: it's describing the same search to the same content. */
  searchPlaceholder: string
  /** Desktop only — the header's top-level nav items (Categories / Map /
   *  More, by default), in order. Empty falls back to
   *  DEFAULT_DESKTOP_NAV_ITEMS. Mobile has no top nav and ignores this. */
  desktopNavItems: DesktopNavItem[]
  /** Desktop only — the small amber-ish eyebrow above the Browse/Search
   *  card's heading (e.g. "Get started"). */
  desktopBrowseEyebrow: string
  /** Desktop only — the Browse/Search card's own heading. Was the same
   *  field as `heroTitle` (mobile's big heading); now separate so the two
   *  can read differently even though they're describing the same search. */
  desktopBrowseHeading: string
  /** Desktop only — the warm hero band's bold headline. */
  desktopHeroHeadline: string
  /** Desktop only — the smaller supporting line under the headline. Empty
   *  renders the headline alone. */
  desktopHeroSubhead: string
  /** Desktop only — the hero band's photo. Null shows the CSS gradient
   *  placeholder instead. */
  desktopHeroImage: { url: string; alt: string } | null
  /** Desktop only — the home screen's accent color (eyebrows, the hero
   *  band, HomeBreak/Subscribe's CTAs), as a 6-digit hex. Lighter/darker
   *  shades used alongside it are derived from this one value. */
  desktopAccentColor: string
}

/** One entry in the desktop header's top nav, or in the "More" panel it can
 *  nest one level of. */
export type DesktopNavItem = {
  /** Stable key — kept across renames/reorders so a rename can't read as
   *  "removed then added". */
  id: string
  label: string
  /** 'categories-menu' is the one fixed built-in — the mega-menu driven by
   *  Home page sections, always the same panel, can't point anywhere else.
   *  'more-menu' opens a small nested list of its own 'link' items (`items`
   *  below). Anything else is a plain 'link'. */
  kind: 'categories-menu' | 'more-menu' | 'link'
  /** Only for kind 'link': a built-in destination (see
   *  BUILT_IN_DESKTOP_LINK_TARGETS) or a CardDef id (category slug / form
   *  id), same targets a mobile tab or featured-card slot can point at. */
  target?: string
  /** Only for kind 'more-menu': its own ordered sub-items, each kind
   *  'link' (never nested further). */
  items?: DesktopNavItem[]
}

/** The desktop nav's built-in link destinations — whole app screens/actions
 *  rather than one category. 'map' is hidden when the community has no Map
 *  pseudo-category, same gating the mobile tab bar and the old hardcoded nav
 *  already applied. 'feedback' opens the feedback modal instead of
 *  navigating. */
export const BUILT_IN_DESKTOP_LINK_TARGETS = ['map', 'about', 'privacy', 'feedback'] as const
export type BuiltInDesktopLinkTarget = (typeof BUILT_IN_DESKTOP_LINK_TARGETS)[number]

export function isBuiltInDesktopLinkTarget(target: string): target is BuiltInDesktopLinkTarget {
  return (BUILT_IN_DESKTOP_LINK_TARGETS as readonly string[]).includes(target)
}

/** What the desktop top nav has always been, as data — the fallback whenever
 *  nothing has been configured. Exactly today's hardcoded structure. */
export const DEFAULT_DESKTOP_NAV_ITEMS: DesktopNavItem[] = [
  { id: 'categories', label: 'Categories', kind: 'categories-menu' },
  { id: 'map', label: 'Map', kind: 'link', target: 'map' },
  {
    id: 'more',
    label: 'More',
    kind: 'more-menu',
    items: [
      { id: 'about', label: 'About', kind: 'link', target: 'about' },
      { id: 'feedback', label: 'Feedback', kind: 'link', target: 'feedback' },
      { id: 'privacy', label: 'Privacy', kind: 'link', target: 'privacy' },
    ],
  },
]

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

export const DEFAULT_SEARCH_PLACEHOLDER = 'Search — kosher food, mikvah, shuls, schools…'
export const DEFAULT_DESKTOP_BROWSE_EYEBROW = 'Get started'
export const DEFAULT_DESKTOP_ACCENT_COLOR = '#b45309'

/** A small curated set — same idea as CategoryEditor's PIN_COLORS — so the
 *  admin picker offers a one-click palette instead of demanding a hex value
 *  from someone who's never used one. Still just a starting point: the input
 *  beside it takes any 6-digit hex. */
export const DESKTOP_ACCENT_PRESETS = [
  '#b45309', // amber-700 — today's default
  '#0f766e', // teal-700
  '#7c3aed', // violet-600
  '#be123c', // rose-700
  '#1d4ed8', // blue-700
  '#166534', // green-800
] as const

// Same split HeroHeading.tsx's own splitMission() does, duplicated rather
// than imported: that's a 'use client' component and this defaults object is
// also read server-side (getSiteSettingsUncached's fallback). Only used here
// to seed a sensible one-time default — HeroHeading keeps doing the real
// split on `mission` for any settings row saved before this field existed.
export function defaultHeroSplit(mission: string): { headline: string; subhead: string } {
  const trimmed = mission.trim()
  const i = trimmed.indexOf(' — ')
  if (i === -1) return { headline: trimmed, subhead: '' }
  return { headline: trimmed.slice(0, i).trim(), subhead: trimmed.slice(i + 3).trim() }
}
const heroSplit = defaultHeroSplit(community.mission)

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
  searchPlaceholder: DEFAULT_SEARCH_PLACEHOLDER,
  desktopNavItems: DEFAULT_DESKTOP_NAV_ITEMS,
  desktopBrowseEyebrow: DEFAULT_DESKTOP_BROWSE_EYEBROW,
  desktopBrowseHeading: DEFAULT_HERO_TITLE,
  desktopHeroHeadline: heroSplit.headline,
  desktopHeroSubhead: heroSplit.subhead,
  desktopHeroImage: community.heroImage,
  desktopAccentColor: DEFAULT_DESKTOP_ACCENT_COLOR,
}

/** Bump when the icon RENDERING changes — the inset, the trim, the padding
 *  colour, anything that alters the generated PNG for an unchanged logo.
 *
 *  Learned the hard way. The first version of iconVersion keyed only on the
 *  logo URL, which is correct for "the admin uploaded a new logo" and useless
 *  for "we changed how the icon is drawn": the URL stays identical, so the CDN
 *  and every phone keep serving the previously-rendered PNG and the change is
 *  invisible no matter how many times it deploys. The token has to describe
 *  what the icon LOOKS like, and that depends on the renderer as much as the
 *  source. */
const ICON_RENDER_VERSION = 2

/** A short token that changes whenever the logo — or the way it is rendered —
 *  does.
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
  if (!value) return `0-${ICON_RENDER_VERSION}`
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return `${Math.abs(hash).toString(36)}-${ICON_RENDER_VERSION}`
}
