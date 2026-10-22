// ── The guide's own pages are never read (the user, Oct 21) ─────────────────
// A watch reads a place's own website to keep its listing current. Mikvah
// Moishe Zvi's was given the guide's own listing page for it, so the guide
// was "checking" the listing against itself: whatever it said, the page
// agreed. Every read goes through fetchPublic (and the browser's render),
// which refuse a page on one of the guide's hosts, redirects included, and
// an admin can't add one as a watch.
//
// Pure: the hosts come from the environment.

/** The guide's address before any custom-domain variable is set. */
const GUIDE_DOMAINS = ['phillyjewishguide.com']

type Env = Record<string, string | undefined>

const bare = (host: string) => host.toLowerCase().replace(/^www\./, '').replace(/\.$/, '')

function hostOf(raw: string): string | null {
  try {
    return bare(new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname)
  } catch {
    return null
  }
}

/** Every host the guide answers on: its domain, and the addresses Vercel
 *  gives this deployment. */
export function guideHosts(env: Env = process.env): Set<string> {
  const named = [env.NEXT_PUBLIC_SITE_URL, env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_URL, env.VERCEL_BRANCH_URL]
  return new Set([...GUIDE_DOMAINS, ...named.filter((h): h is string => !!h).map(hostOf).filter((h): h is string => !!h)])
}

/** Whether a web address is one of the guide's own pages. */
export function isGuidePage(url: string | URL, env: Env = process.env): boolean {
  const host = hostOf(url.toString())
  if (!host) return false
  for (const own of guideHosts(env)) if (host === own || host.endsWith(`.${own}`)) return true
  return false
}

export const GUIDE_PAGE_ERROR = 'That’s a page of this guide. Give the place’s own website.'
