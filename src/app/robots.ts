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
      // Every community's, by wildcard (Google, Bing and the rest read `*`):
      // until Nov 20 only Philly's were listed, so a second community's
      // console was fair game. The bare paths are the superadmin console and
      // the inbox.
      disallow: ['/admin', '/inbox', '/*/admin', '/*/inbox', '/api/'],
    },
    sitemap: `${base}/sitemap.xml`,
  }
}
