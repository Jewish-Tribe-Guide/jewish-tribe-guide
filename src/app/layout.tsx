import type { Metadata, Viewport } from 'next'
import { Elms_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { community } from '@/community.config'
import { getSiteSettings } from '@/lib/siteSettingsStore'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import './globals.css'

// Elms Sans, on request (was Manrope, San Francisco/the system-font stack,
// Inter for just the title/headers, Figtree, and before that a separate
// serif headline face, in that order). Loaded as a variable font (no
// `weight` array — Elms Sans' own axis spans 100-900) so every existing
// `font-*` weight utility across the whole site renders in Elms Sans
// automatically; the title (Extrabold/800), section headers
// (Semibold/600), and everything else (Regular/400, see the `body` rule in
// globals.css) all share this one loaded family, differing only by weight.
const elmsSans = Elms_Sans({ subsets: ['latin'] })

// Reads the admin-edited site name/mission for the tab title and meta
// description. Falls back to the community.config defaults on any failure
// (e.g. the site_settings table not migrated yet) — a settings hiccup must
// never break metadata generation for the whole page.
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings().catch(() => SITE_SETTINGS_DEFAULTS)
  return {
    title: settings.name,
    description: settings.mission,
    manifest: '/manifest.webmanifest',
    // Standalone "Add to Home Screen" experience on iOS.
    appleWebApp: {
      capable: true,
      title: community.shortName,
      statusBarStyle: 'default',
    },
  }
}

export const viewport: Viewport = {
  themeColor: community.themeColor,
  // Let content extend into the notch / home-indicator areas so our own
  // safe-area padding (globals.css + sticky headers) can manage the insets.
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={elmsSans.className}
      // Brand color is single-sourced from community.config: override the
      // Tailwind `primary` utilities' variable at runtime so it always matches
      // `themeColor` (browser chrome / manifest). globals.css holds only a
      // build-time fallback. `--color-primary-dark` derives from this in CSS.
      style={{ '--color-primary': community.themeColor } as React.CSSProperties}
    >
      <body className="bg-surface text-slate-900 antialiased min-h-screen flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
