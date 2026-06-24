// Honeypot bot trap. We render a hidden field that a human never sees or fills,
// but automated form-fillers tend to complete. If it arrives non-empty, the
// request is almost certainly a bot — we drop it silently (return a fake success
// so the bot doesn't learn it was caught and adapt).
//
// Real users always send this empty/absent, so there are no false positives.
// This complements rate limiting: the limiter caps volume, the honeypot filters
// out the dumb-bot traffic before it costs a geocode/email.

export const HONEYPOT_FIELD = 'company'

export function isHoneypotTripped(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const value = (body as Record<string, unknown>)[HONEYPOT_FIELD]
  return typeof value === 'string' && value.trim().length > 0
}
