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
