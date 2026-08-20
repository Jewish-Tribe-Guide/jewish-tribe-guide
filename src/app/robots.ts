import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/siteUrl'

// The admin console and the response inbox hold submitted personal details, so
// they're disallowed regardless of the auth in front of them — a crawler has no
// business fetching them, and neither belongs in a search result.
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl()

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // The bare paths still redirect (see next.config.ts), so both the old
      // and new (canonical, /philly-prefixed) URLs are blocked.
      disallow: ['/admin', '/inbox', '/philly/admin', '/philly/inbox', '/api/'],
    },
    sitemap: `${base}/sitemap.xml`,
  }
}
