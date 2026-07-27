import type { ContactHospitalData } from '@/types'
import { LIMITS, tooLong } from './limits'

// Strips all non-digit characters and checks for a plausible phone number length.
// Accepts US formats like (215) 555-0100, 215-555-0100, +12155550100, etc.
export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  // Allow 10 digits (US local) or 11 digits (US with country code 1) or
  // 7–15 digits for international numbers.
  return digits.length >= 7 && digits.length <= 15
}

// Live-formats a US phone number as the visitor types, matching the shape
// Google Places' own `nationalPhoneNumber` field already returns when it
// auto-fills a listing — "(215) 545-0506" — so a manually-typed number reads
// identically to an auto-filled one instead of looking different. Reformats
// on every keystroke from the digits alone (so it's idempotent — running it
// on an already-formatted or Google-provided value is a no-op) and leaves
// anything that isn't a plausible 10/11-digit US number untouched (an
// extension, or a non-US number) rather than mangling it into a bad mask.
export function formatPhone(value: string): string {
  let digits = value.replace(/\D/g, '')
  if (digits.length > 11) return value
  if (digits.length === 11) {
    if (!digits.startsWith('1')) return value
    digits = digits.slice(1)
  }
  if (digits.length === 0) return ''
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
}

// Adds "https://" to a bare website typed without a scheme — "example.com" or
// "www.example.com", how basically everyone actually types one — since a
// stored url field is used directly as a link's href (see
// GenericListingCard), so it needs a real scheme to actually work rather than
// resolving as a broken relative link on this site. Leaves an existing
// http(s):// URL alone (idempotent), and leaves any other scheme someone
// typed on purpose (mailto:, tel:, ftp://) untouched so isHttpUrl's own check
// can still reject it with a clear message instead of this silently mangling it.
export function normalizeUrl(value: string): string {
  const v = value.trim()
  if (!v) return v
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return v // already has a scheme, e.g. http://, ftp://
  if (/^mailto:|^tel:/i.test(v)) return v // schemes that don't use "//"
  return `https://${v}`
}

// Accepts only http/https URLs. Rejects dangerous schemes (javascript:, data:,
// vbscript:, file:, etc.) — `url`-type fields render as clickable link buttons
// on approved listings, so a non-http scheme would be an injection vector.
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function validateContact(contact: ContactHospitalData): string[] {
  const errs: string[] = []
  if (!contact.fullName.trim()) errs.push('Name is required.')
  // A request needs at least one way to reach back — phone or email.
  const hasPhone = !!contact.phone.trim()
  const hasEmail = !!contact.email.trim()
  if (!hasPhone && !hasEmail) {
    errs.push('A phone number or email is required.')
  } else if (hasPhone && !isValidPhone(contact.phone)) {
    errs.push('Please enter a valid phone number.')
  }
  // Size caps.
  if (tooLong(contact.fullName, LIMITS.name)) errs.push('Name is too long.')
  if (tooLong(contact.phone, LIMITS.phone)) errs.push('Phone number is too long.')
  if (tooLong(contact.email, LIMITS.email)) errs.push('Email is too long.')
  return errs
}
