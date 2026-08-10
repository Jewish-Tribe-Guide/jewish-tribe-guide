// ── Community configuration ─────────────────────────────────────────────────
// The single place to re-brand this app for a different community. To stand up a
// new deployment, edit the values here — the page title, header, footer, hero,
// and PWA manifest all read from this object rather than hardcoding strings.
//
// Not covered here (edit alongside this file):
//  • Palette — `themeColor` below is the single source for the brand color: it
//    drives the browser chrome, the PWA manifest, and the Tailwind `primary`
//    utilities (injected as --color-primary in src/app/layout.tsx). The value
//    in globals.css is only a build-time fallback.
//  • Location data — hospitals in src/data/hospitals; eruvim (read at
//    runtime) in src/data/resources.
//  • Initial listings — the seed arrays in src/data/resources, loaded into
//    the database once by scripts/seed.mjs. Replace with your own content.
//  • Logo — the StarOfDavid mark in src/components/icons.tsx, and the browser
//    icon at src/app/favicon.ico.
//
// See README.md ("Rebrand for a new community") for the full checklist.

export const community = {
  /** Full name — page title, header, footer, and PWA manifest. */
  name: 'Philadelphia Jewish Community',
  /** Short name for the iOS/Android home-screen icon (keep it ~12 chars). */
  shortName: 'PJC',
  /** Subtitle shown under the name in the header. */
  tagline: 'Guide for residents, visitors, and patients',
  /** One-line mission — the hero subtitle, footer blurb, and <meta description>. */
  mission:
    'A guide to Jewish Philadelphia — community resources for residents, visitors, and hospital patients.',
  /** Longer phrasing used only in the PWA manifest description. */
  manifestDescription:
    "Connecting patients, families, and neighbors with Philadelphia's Jewish community resources",
  /** Region/area name, used in copy such as "the {region}-area eruvim". */
  region: 'Philadelphia',
  /** IANA timezone for the community — drives zmanim/candle-lighting when the
   *  visitor is located by address rather than a hospital (which carries its
   *  own tz). Must be a valid tz database name, e.g. 'America/Chicago'. */
  timezone: 'America/New_York',
  /** Default map center — used when the visitor has no location set and there
   *  are no pins to frame. Roughly the middle of the community's area. */
  mapCenter: { lat: 39.9526, lng: -75.1652 },
  /** Brand color for browser chrome / PWA. Keep in sync with --color-primary
   *  in globals.css (that CSS var drives the Tailwind `primary` utilities). */
  themeColor: '#1d4ed8',
  /** App background color for the PWA splash screen. */
  backgroundColor: '#f8fafc',

  /** Optional modules — turn a hand-built card/flow off for a community that
   *  doesn't need it. (Database categories like restaurants or mikvah are
   *  managed in the DB, not here — these flags cover the community-specific
   *  cards only.) Everything defaults on, matching this deployment. */
  features: {
    /** "Eruv Information" card + page. */
    eruv: true,
    /** "Zmanim & Shabbos" (candle-lighting / davening times) card + page. */
    zmanim: true,
    /** "Jewish Medical Resources" card — per-hospital Jewish life. */
    medicalResources: true,
    /** "Patient & Family Support" request flow. */
    patientSupport: true,
    /** "Volunteer for Patients" flow. */
    volunteer: true,
  },

  /** UI capabilities — which affordances the app shows. The base code is the
   *  same for every community; these toggles turn pieces on/off. Everything
   *  defaults on (matching this deployment); omit any key to keep it on. Read
   *  through src/lib/uiConfig.ts, which fills in defaults. */
  ui: {
    /** Public contributions. Turn a group off for a curated, admin-only
     *  directory — the buttons disappear AND the server rejects those writes. */
    contributions: {
      /** "Add" buttons on each category directory. */
      add: true,
      /** Per-listing "Edit" button. */
      edit: true,
      /** Per-listing "Report" button. */
      report: true,
    },
    /** Show/hide the search bar on each screen independently. */
    search: {
      /** The hero search on the home screen. */
      landing: true,
      /** The per-category directory search. */
      directory: true,
      /** The resource map's search. */
      map: true,
    },
    /** The resource map and its extras. */
    map: {
      /** The "View Map" card + the whole map screen. Off = no map anywhere. */
      enabled: true,
      /** The "Start live tracking" (live GPS) bar on the map. */
      liveTracking: true,
      /** The "Nearby" list tab on the map. */
      nearbyList: true,
      /** Pinning listings to a personal shortlist, and the map's "Pinned" filter. */
      pins: true,
    },
    /** Global on/off for upvotes, layered on top of each category's DB setting. */
    upvotes: true,
  },
} as const

// ── Validation ───────────────────────────────────────────────────────────────
// Runs once on import (so any code path that touches the config triggers it) and
// throws loudly if a rebrand left a required field blank or malformed — better a
// clear build/boot failure than "undefined" rendered in the header.
function validateCommunityConfig(c: typeof community): void {
  const errs: string[] = []

  const required = ['name', 'shortName', 'tagline', 'mission', 'region', 'timezone'] as const
  for (const key of required) {
    if (!c[key] || !String(c[key]).trim()) errs.push(`\`${key}\` must be a non-empty string`)
  }

  const hex = /^#[0-9a-fA-F]{6}$/
  if (!hex.test(c.themeColor)) errs.push('`themeColor` must be a 6-digit hex color like #1d4ed8')
  if (!hex.test(c.backgroundColor)) errs.push('`backgroundColor` must be a 6-digit hex color like #f8fafc')

  const { lat, lng } = c.mapCenter ?? {}
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) errs.push('`mapCenter.lat` must be between -90 and 90')
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) errs.push('`mapCenter.lng` must be between -180 and 180')

  // A valid IANA zone can be constructed into a DateTimeFormat without throwing.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: c.timezone })
  } catch {
    errs.push(`\`timezone\` (${c.timezone}) is not a valid IANA timezone, e.g. 'America/Chicago'`)
  }

  if (errs.length) {
    throw new Error(
      `Invalid community.config.ts — fix before deploying:\n  • ${errs.join('\n  • ')}`,
    )
  }
}

validateCommunityConfig(community)
