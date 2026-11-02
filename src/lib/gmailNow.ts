import type { NewsletterEmail } from './newsletterRun'
import { getNewsletterSetup } from './newsletterSetupStore'

// Read now for email (boards *14): the guide's Gmail script, deployed as a web
// app (scripts/newsletter-apps-script.js, doPost), asked for one address's
// latest email in its 14 days. The site reads what comes back. The hourly run
// goes on whether or not this answers.

/** What a script's web app link looks like. It's the only place a stored link
 *  can send the site, so nothing else is taken. */
const WEB_APP_LINK = /^https:\/\/script\.google\.com\/(a\/[^/\s]+\/)?macros\/s\/[\w-]+\/exec$/

export function readWebAppLink(raw: unknown): string | null {
  const link = typeof raw === 'string' ? raw.trim() : ''
  return WEB_APP_LINK.test(link) ? link : null
}

export type GmailAnswer = { ok: true; account: string | null; email: NewsletterEmail | null } | { ok: false }

/** Asks the script. It redirects to its answer, which fetch follows. Without
 *  `address`, whether it's there and has this key: how a pasted link is tried. */
export async function askGmail(link: string, key: string, address?: string, fetchImpl: typeof fetch = fetch): Promise<GmailAnswer> {
  try {
    const res = await fetchImpl(link, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ key, ...(address ? { address } : {}) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    })
    const body = (await res.json().catch(() => null)) as { ok?: unknown; account?: unknown; email?: NewsletterEmail | null } | null
    if (!res.ok || body?.ok !== true) return { ok: false }
    return { ok: true, account: typeof body.account === 'string' && body.account ? body.account : null, email: body.email ?? null }
  } catch {
    return { ok: false }
  }
}

export type EmailLook =
  /** No web app connected to ask. */
  | { state: 'no-gmail' }
  /** It didn't answer: the hourly run still looks. */
  | { state: 'no-answer' }
  | { state: 'no-email'; account: string | null }
  | { state: 'found'; account: string | null; email: NewsletterEmail; on: string }

/** "Oct 30", when it was sent. */
export function sentOn(date: string | null): string {
  return date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'recent'
}

/** That address's latest email, as the guide's Gmail has it. */
export async function latestEmailFrom(community: string, address: string, fetchImpl: typeof fetch = fetch): Promise<EmailLook> {
  const setup = await getNewsletterSetup(community)
  if (!setup?.webAppUrl) return { state: 'no-gmail' }
  const got = await askGmail(setup.webAppUrl, setup.key, address, fetchImpl)
  if (!got.ok) return { state: 'no-answer' }
  const account = got.account ?? setup.account
  return got.email ? { state: 'found', account, email: got.email, on: sentOn(got.email.date) } : { state: 'no-email', account }
}
