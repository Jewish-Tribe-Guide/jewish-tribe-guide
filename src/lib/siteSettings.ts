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
}

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
}
