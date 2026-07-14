// ── Community configuration ─────────────────────────────────────────────────
// The single place to re-brand this app for a different community. To stand up a
// new deployment, edit the values here — the page title, header, footer, hero,
// and PWA manifest all read from this object rather than hardcoding strings.
//
// Not covered here (edit alongside this file):
//  • Palette — the `primary` color lives in src/app/globals.css (@theme
//    --color-primary). Keep `themeColor` below in sync with it.
//  • Location data — hospitals in src/data/hospitals, eruvim in
//    src/data/resources.
//  • Logo — the StarOfDavid mark in src/components/icons.tsx.

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
  /** Brand color for browser chrome / PWA. Keep in sync with --color-primary
   *  in globals.css (that CSS var drives the Tailwind `primary` utilities). */
  themeColor: '#1d4ed8',
  /** App background color for the PWA splash screen. */
  backgroundColor: '#f8fafc',
} as const
