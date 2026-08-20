// The site's own absolute base URL — for anything that has to emit a full URL
// rather than a path (sitemap.ts, robots.ts, JSON-LD structured data). Was
// duplicated identically in the first two; centralized here rather than
// copy-pasting a third time.
export function siteUrl(): string {
  // Vercel provides the production domain; the env var is the override for a
  // custom domain. Falls back to localhost so `next build` works anywhere.
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  return vercel ? `https://${vercel}` : 'http://localhost:3000'
}
