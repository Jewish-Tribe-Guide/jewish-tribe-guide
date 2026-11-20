import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { reportServerError } from '@/lib/serverError'

// Abuse protection for public endpoints. Two-tier by design:
//
//   • If UPSTASH_REDIS_REST_URL/TOKEN are set, we use a durable, distributed
//     sliding-window limiter — the only kind that actually holds up when Vercel
//     fans out across many serverless instances. This is what you want in prod.
//   • If they're NOT set, we fall back to a per-instance in-memory limiter so
//     there's still *some* protection (and local dev works). It's best-effort:
//     it can't see requests handled by other instances, so configure Upstash
//     (free tier is plenty) for real coverage.
//
// The point of all this is cost control: every submission geocodes + emails,
// and several public routes call paid Google APIs. Capping request *rate*
// caps the bill.

type Decision = { ok: true } | { ok: false; retryAfter: number }

const hasUpstash = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
)

const redis = hasUpstash ? Redis.fromEnv() : null

// On the live site, no Upstash is a setup mistake, not a mode (Nov 20, the
// health sweep): each instance counts on its own, so a per-visitor limit
// is loose and a ceiling for everyone together (sharedLimit) is no ceiling
// at all. The per-visitor limits keep counting in memory; the shared
// ceilings refuse. Either way it is reported, once per instance.
const live = () => process.env.VERCEL_ENV === 'production'
let reportedMissing = false
function reportMissingUpstash() {
  if (reportedMissing) return
  reportedMissing = true
  reportServerError('[rateLimit] UPSTASH_REDIS_REST_URL/TOKEN are not set on the live site: limits count per instance, shared ceilings refuse')
}

// Cache one Ratelimit instance per (limit, windowSec) so we don't rebuild them.
const upstashLimiters = new Map<string, Ratelimit>()

function upstashLimiter(limit: number, windowSec: number): Ratelimit {
  const key = `${limit}:${windowSec}`
  let rl = upstashLimiters.get(key)
  if (!rl) {
    rl = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
      prefix: 'jpc-rl',
      analytics: false,
    })
    upstashLimiters.set(key, rl)
  }
  return rl
}

// ── In-memory fallback ────────────────────────────────────────────────────────
// Fixed-window counters keyed by bucket. Pruned lazily so the Map can't grow
// without bound under a flood of distinct keys.
const memory = new Map<string, { count: number; resetAt: number }>()

function memoryDecision(key: string, limit: number, windowSec: number): Decision {
  const now = Date.now()
  const windowMs = windowSec * 1000

  if (memory.size > 10_000) {
    for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k)
  }

  const entry = memory.get(key)
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true }
  }
  if (entry.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }
  entry.count += 1
  return { ok: true }
}

// Best-effort client identifier from proxy headers. Vercel sets x-forwarded-for;
// we take the first hop. Falls back to a constant so a missing IP still shares a
// bucket (fails safe toward limiting rather than wide open).
export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

// Checks one request against a named bucket. `name` namespaces the limit (e.g.
// 'submissions') so different endpoints don't share a counter.
export async function rateLimit(
  request: Request,
  name: string,
  opts: { limit: number; windowSec: number },
): Promise<Decision> {
  const key = `${name}:${clientIp(request)}`
  const { limit, windowSec } = opts

  if (redis) {
    try {
      const res = await upstashLimiter(limit, windowSec).limit(key)
      if (res.success) return { ok: true }
      const retryAfter = Math.max(1, Math.ceil((res.reset - Date.now()) / 1000))
      return { ok: false, retryAfter }
    } catch (err) {
      // Never let a limiter outage take down the endpoint — degrade to memory.
      console.error('[rateLimit] Upstash error, falling back to memory:', err)
    }
  } else if (live()) reportMissingUpstash()
  return memoryDecision(key, limit, windowSec)
}

// Convenience: returns a 429 Response when blocked, or null when allowed.
export async function enforceRateLimit(
  request: Request,
  name: string,
  opts: { limit: number; windowSec: number },
): Promise<Response | null> {
  const decision = await rateLimit(request, name, opts)
  if (decision.ok) return null
  return Response.json(
    { ok: false, errors: ['Too many requests. Please slow down and try again shortly.'] },
    { status: 429, headers: { 'Retry-After': String(decision.retryAfter) } },
  )
}

/** One limit for everyone together, not per visitor: a ceiling on how often
 *  something that costs money can happen at all (the question reader's
 *  calls a day). Same limiter, one shared key. */
export async function sharedLimit(name: string, opts: { limit: number; windowSec: number }): Promise<Decision> {
  const key = `${name}:everyone`
  if (redis) {
    try {
      const res = await upstashLimiter(opts.limit, opts.windowSec).limit(key)
      return res.success ? { ok: true } : { ok: false, retryAfter: Math.max(1, Math.ceil((res.reset - Date.now()) / 1000)) }
    } catch (err) {
      console.error('[rateLimit] Upstash error, falling back to memory:', err)
    }
  } else if (live()) {
    reportMissingUpstash()
    return { ok: false, retryAfter: opts.windowSec }
  }
  return memoryDecision(key, opts.limit, opts.windowSec)
}

// ── What the paid readers may spend, all of them together (Nov 20) ──
// The two photo readers (a schedule, a message or menu: /api/schedule/read,
// /api/message/read) each send photos or a PDF to the model. They were
// limited per visitor only, so many visitors, or one with many addresses,
// had no ceiling. This is that ceiling: reads a day, both readers in one
// count. Past it they answer as they do when reading is off, and the box
// offers typing instead. The question reader has its own (ask/read).
export const PHOTO_READS_A_DAY = 300

/** Null when a photo read may go ahead today; otherwise the answer to send. */
export async function photoReaderSpend(): Promise<Response | null> {
  const today = await sharedLimit('photo-readers-day', { limit: PHOTO_READS_A_DAY, windowSec: 86_400 })
  if (today.ok) return null
  return Response.json(
    { ok: false, code: 'off', error: 'Reading photos is paused for today. Type it in instead.' },
    { status: 503, headers: { 'Retry-After': String(today.retryAfter) } },
  )
}
