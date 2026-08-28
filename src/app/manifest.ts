import type { MetadataRoute } from 'next'
import { community } from '@/community.config'
import { getSiteSettings } from '@/lib/siteSettingsStore'
import { iconVersion, SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import { getDefaultCommunity } from '@/lib/communityStore'

// Web app manifest — enables "Add to Home Screen" with an app-like standalone
// window.
//
// The icons are generated from the admin's uploaded logo (see
// app/icons/[size]/route.ts). They used to point at src/app/favicon.ico, which
// is still the untouched Next.js starter file — so adding the site to a phone's
// home screen produced a Next.js logo.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getSiteSettings((await getDefaultCommunity()).slug).catch(
    () => SITE_SETTINGS_DEFAULTS,
  )
  const hasLogo = !!settings.logoUrl?.trim()
  // See iconVersion: without this a new logo keeps the old home-screen icon.
  const v = iconVersion(settings.logoUrl)

  return {
    name: settings.name,
    short_name: community.shortName,
    description: community.manifestDescription,
    start_url: '/',
    display: 'standalone',
    background_color: community.backgroundColor,
    theme_color: community.themeColor,
    // Only advertise the generated icons when there's a logo to generate them
    // from. With no logo there is no icon to offer — the starter favicon.ico
    // that used to fill this slot has been deleted, because a Next.js logo on
    // someone's home screen is worse than the OS's own generic placeholder.
    icons: hasLogo
      ? [
          { src: `/icons/192?v=${v}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `/icons/512?v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          // A separate, padded rendering. Android crops a maskable icon to the
          // launcher's shape and only the middle ~80% is guaranteed to
          // survive, so declaring the full-bleed image here would clip the
          // logo's edges on a circular launcher.
          {
            src: `/icons/512?maskable=1&v=${v}`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ]
      : [],
  }
}
