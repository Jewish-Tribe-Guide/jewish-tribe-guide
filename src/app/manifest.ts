import type { MetadataRoute } from 'next'

// Web app manifest — enables "Add to Home Screen" with an app-like standalone
// window. Icons currently point at the favicon; swap in dedicated 192/512 PNGs
// when available for a sharper home-screen icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Philadelphia Jewish Community',
    short_name: 'PJC',
    description:
      "Connecting patients, families, and neighbors with Philadelphia's Jewish community resources",
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#1d4ed8',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  }
}
