import type { ContactHospitalData } from '@/types'

// Strips all non-digit characters and checks for a plausible phone number length.
// Accepts US formats like (215) 555-0100, 215-555-0100, +12155550100, etc.
export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  // Allow 10 digits (US local) or 11 digits (US with country code 1) or
  // 7–15 digits for international numbers.
  return digits.length >= 7 && digits.length <= 15
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
  return errs
}
