import type { Metadata, Viewport } from 'next'
import { Figtree } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import ServiceWorker from '@/components/ServiceWorker'
import { community } from '@/community.config'
import { getSiteSettings } from '@/lib/siteSettingsStore'
import { iconVersion, SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import './globals.css'
import { getDefaultCommunity } from '@/lib/communityStore'

const figtree = Figtree({ subsets: ['latin'] })

// Reads the admin-edited site name/mission for the tab title and meta
// description. Falls back to the community.config defaults on any failure
// (e.g. the site_settings table not migrated yet) — a settings hiccup must
// never break metadata generation for the whole page.
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings((await getDefaultCommunity()).slug).catch(() => SITE_SETTINGS_DEFAULTS)
  const hasLogo = !!settings.logoUrl?.trim()

  return {
    title: settings.name,
    description: settings.mission,
    manifest: '/manifest.webmanifest',
    // Proves ownership to Google Search Console — per-deployment (a template
    // fork's own site needs its own code), so it's an env var, not hardcoded.
    // Omitted entirely when unset, same as the icons below.
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
      ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } }
      : {}),
    // Standalone "Add to Home Screen" experience on iOS.
    appleWebApp: {
      capable: true,
      title: community.shortName,
      statusBarStyle: 'default',
    },
    // Generated from the admin's logo (app/icons/[size]). Declared here as
    // well as in the manifest because iOS reads `apple-touch-icon` for "Add to
    // Home Screen" rather than the manifest's icon list — the manifest alone
    // left iPhones falling back to favicon.ico, which is still the Next.js
    // starter file. `icon` overrides that same file for the browser tab.
    //
    // Omitted entirely when no logo is set, so nothing points at a 404.
    ...(hasLogo
      ? {
          icons: {
            // ?v= so a new logo is a new URL — see iconVersion. iOS in
            // particular caches apple-touch-icon hard once the site has been
            // added to a home screen, so without this the icon there stays
            // whatever it was on the day it was added.
            icon: [{ url: `/icons/32?v=${iconVersion(settings.logoUrl)}`, sizes: '32x32', type: 'image/png' }],
            apple: [{ url: `/icons/180?v=${iconVersion(settings.logoUrl)}`, sizes: '180x180', type: 'image/png' }],
          },
        }
      : {}),
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
      className={figtree.className}
      // Brand color is single-sourced from community.config: override the
      // Tailwind `primary` utilities' variable at runtime so it always matches
      // `themeColor` (browser chrome / manifest). globals.css holds only a
      // build-time fallback. `--color-primary-dark` derives from this in CSS.
      style={{ '--color-primary': community.themeColor } as React.CSSProperties}
    >
      {/* min-h-dvh, not min-h-screen: 100vh is the LARGEST possible mobile
          viewport (address bar hidden) — on a page that's meant to scroll
          that's invisible, but the map screen sizes itself to fill exactly
          this height (see ResourceMapView), so a 100vh body taller than the
          actually-visible area pushed its bottom edge (the sheet) just past
          the fold, needing a small scroll to reveal it. 100dvh tracks the
          real visible viewport as the browser chrome shows/hides. */}
      <body className="bg-surface text-slate-900 antialiased min-h-dvh flex flex-col">
        {children}
        <Analytics />
        <SpeedInsights />
        <ServiceWorker />
      </body>
    </html>
  )
}
