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
  return bearer === secret || req.headers.get('x-cron-secret') === secret
}
