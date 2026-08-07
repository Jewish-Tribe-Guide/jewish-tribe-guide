import type { MetadataRoute } from 'next'

// The admin console and the response inbox hold submitted personal details, so
// they're disallowed regardless of the auth in front of them — a crawler has no
// business fetching them, and neither belongs in a search result.
export default function robots(): MetadataRoute.Robots {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  const base = explicit
    ? explicit.replace(/\/$/, '')
    : vercel
      ? `https://${vercel}`
      : 'http://localhost:3000'

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/inbox', '/api/'],
    },
    sitemap: `${base}/sitemap.xml`,
  }
}
