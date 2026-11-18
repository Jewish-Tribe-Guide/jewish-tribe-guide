import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

/** Whether a request may run a cron route. With CRON_SECRET set, the request
 *  must send it as `Authorization: Bearer <secret>` (what Vercel's own cron
 *  sends) or `x-cron-secret: <secret>`.
 *
 *  No secret configured: open in dev for convenience, but FAIL CLOSED in
 *  production. An unauthenticated endpoint that fans out to paid Google
 *  Places calls per listing, or files suggestions into the moderation queue,
 *  is a risk if anyone finds the URL. Set CRON_SECRET in the production
 *  environment (e.g. Vercel env vars) so the routes, and Vercel's own cron,
 *  can authenticate. */
export function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  // Both checked, whichever matches, so the time taken doesn't say which.
  const viaBearer = sameSecret(bearer, secret)
  const viaHeader = sameSecret(req.headers.get('x-cron-secret'), secret)
  return viaBearer || viaHeader
}

/** A comparison whose time doesn't depend on how much of the secret was
 *  guessed right (Nov 18 review): `===` stops at the first differing
 *  character. Hashed first, so the two are the same length and the
 *  secret's length isn't given away either. */
function sameSecret(given: string | null | undefined, secret: string): boolean {
  if (given == null) return false
  const digest = (s: string) => createHash('sha256').update(s).digest()
  return timingSafeEqual(digest(given), digest(secret))
}
