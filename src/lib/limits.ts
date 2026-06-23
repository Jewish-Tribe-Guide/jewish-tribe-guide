// Centralized input-size caps. Two jobs: keep junk out of the DB / moderation
// queue, and bound the cost of anything that fans out to a paid API (a giant
// address still costs a geocode; a giant destinations array costs N Google
// lookups). Presence/format validation lives elsewhere — this is purely "is it
// an absurd size".

export const LIMITS = {
  name: 200,
  address: 300,
  phone: 40,
  email: 200,
  note: 1000,
  category: 100,
  shortText: 300,
  longText: 2000,
  /** Max items in /api/travel destinations (each is a paid Google lookup). */
  travelDestinations: 300,
  /** Max serialized size of a whole request body / payload, in bytes. */
  payloadBytes: 100_000,
  /** Max length for any single string found inside a details/formData object. */
  detailValue: 2000,
} as const

// True if a value is a string longer than `max`. Non-strings are ignored here
// (their own validators handle type/shape).
export function tooLong(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.length > max
}

// Rejects a payload whose JSON size is implausibly large before we do any work
// with it. Returns an error string, or null when within budget.
export function payloadTooLarge(payload: unknown): string | null {
  try {
    const bytes = Buffer.byteLength(JSON.stringify(payload ?? null), 'utf8')
    if (bytes > LIMITS.payloadBytes) {
      return 'Submission is too large. Please shorten it and try again.'
    }
  } catch {
    return 'Submission could not be processed.'
  }
  return null
}

// Walks an arbitrary object (e.g. details / formData) and flags the first string
// value that exceeds the per-field cap. Guards against someone stuffing megabytes
// into a free-form detail field that skips the named checks.
export function oversizedField(obj: Record<string, unknown> | undefined | null): boolean {
  if (!obj) return false
  for (const v of Object.values(obj)) {
    if (tooLong(v, LIMITS.detailValue)) return true
    if (Array.isArray(v)) {
      for (const item of v) {
        if (tooLong(item, LIMITS.detailValue)) return true
        if (item && typeof item === 'object' && oversizedField(item as Record<string, unknown>)) {
          return true
        }
      }
    } else if (v && typeof v === 'object') {
      if (oversizedField(v as Record<string, unknown>)) return true
    }
  }
  return false
}
