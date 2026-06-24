// Cloudflare Turnstile server-side verification. Gated on TURNSTILE_SECRET_KEY:
// if the secret isn't configured, verification is skipped (returns true) so the
// app keeps working before the keys are added. Enforcement turns on
// automatically the moment the secret is present in the environment.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export function turnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY)
}

// Returns true if the request should be allowed through.
//
// Failure policy when enabled:
//   • missing/invalid token  → false (block — this is the bot we want to stop)
//   • Cloudflare unreachable → true  (allow — don't let a Turnstile outage take
//     down patient-support intake; rate limiting + honeypot still apply)
export async function verifyTurnstile(
  token: string | undefined,
  ip?: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true // inert until configured
  if (!token) return false

  try {
    const body = new URLSearchParams({ secret, response: token })
    if (ip && ip !== 'unknown') body.set('remoteip', ip)
    const res = await fetch(VERIFY_URL, { method: 'POST', body })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch (err) {
    // Fail open on infrastructure errors only — a bad token already returned
    // false above, so this branch is reached solely when we couldn't reach
    // Cloudflare to ask.
    console.error('[turnstile] verification request failed, allowing through:', err)
    return true
  }
}
