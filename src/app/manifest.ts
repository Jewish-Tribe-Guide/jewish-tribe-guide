import type { MetadataRoute } from 'next'
import { community } from '@/community.config'

// Web app manifest — enables "Add to Home Screen" with an app-like standalone
// window. Icons currently point at the favicon; swap in dedicated 192/512 PNGs
// when available for a sharper home-screen icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: community.name,
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
