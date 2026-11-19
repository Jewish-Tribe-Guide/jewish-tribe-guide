import { guideHosts } from '@/lib/guidePage'

type Env = Record<string, string | undefined>

/**
 * Where a sign-in link sends someone back to.
 *
 * The request's Origin header is the address the person asked from, which
 * is right for a preview or a custom domain. But anyone can post with any
 * Origin, the link goes to a real admin's inbox, and Supabase puts the
 * session in the address the link lands on. So Origin is used only when it
 * is the request's own address or one of the guide's own hosts; otherwise
 * the request's own address (Nov 18 review).
 */
export function linkOrigin(request: Request, env: Env = process.env): string {
  const own = new URL(request.url).origin
  const asked = request.headers.get('origin')
  if (!asked) return own
  let url: URL
  try {
    url = new URL(asked)
  } catch {
    return own
  }
  if (url.origin === own) return own
  if (url.protocol !== 'https:') return own
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  for (const guide of guideHosts(env)) if (host === guide || host.endsWith(`.${guide}`)) return url.origin
  return own
}
