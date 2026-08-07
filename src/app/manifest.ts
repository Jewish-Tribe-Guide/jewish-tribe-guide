import type { MetadataRoute } from 'next'
import { community } from '@/community.config'
import { getSiteSettings } from '@/lib/siteSettingsStore'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import { getDefaultCommunity } from '@/lib/communityStore'

// Web app manifest — enables "Add to Home Screen" with an app-like standalone
// window. Icons currently point at the favicon; swap in dedicated 192/512 PNGs
// when available for a sharper home-screen icon.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getSiteSettings((await getDefaultCommunity()).slug).catch(() => SITE_SETTINGS_DEFAULTS)
  return {
    name: settings.name,
    short_name: community.shortName,
    description: community.manifestDescription,
    start_url: '/',
    display: 'standalone',
    background_color: community.backgroundColor,
    theme_color: community.themeColor,
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  }
}
