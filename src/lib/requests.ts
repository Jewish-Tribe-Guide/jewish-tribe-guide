import type { ContactHospitalData } from '@/types'
import { validateContact } from './validation'
import { LIMITS, tooLong } from './limits'

// ── Request types ──────────────────────────────────────────────────────────────

export type RequestType =
  | 'Direct Support'
  | 'Volunteer'
  | 'Volunteer Edit'
  | 'Volunteer Removal'
  | 'Feedback'

// The payload every form POSTs to /api/requests. `contact` carries the shared
// name/phone/email/hospital fields; `formData` is the request-type-specific blob
// that gets stored verbatim as JSON (system of record keeps everything).
// `requestType` is one of the 5 built-in strings, or (paired with `formId`) a
// custom admin-created form's title — see GenericFormWizard.tsx.
export type SubmissionPayload = {
  requestType: RequestType | string
  formId?: string
  contact: ContactHospitalData
  formData: Record<string, unknown>
}

// Short, human-readable, reasonably unique request id, e.g. "REQ-LXYZ12-4F9A".
export function generateRequestId(): string {
  const time = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `REQ-${time}-${rand}`
}

// Validates the payload. Returns a list of error strings (empty = valid).
export function validateSubmission(payload: SubmissionPayload): string[] {
  if (!payload.requestType) return ['Request type is required.']
  if (payload.requestType === 'Feedback') {
    const msg = typeof payload.formData?.message === 'string' ? payload.formData.message.trim() : ''
    const errs: string[] = []
    if (!msg) errs.push('Please enter your feedback.')
    if (tooLong(msg, LIMITS.longText)) errs.push('Feedback is too long.')
    if (payload.contact?.email && tooLong(payload.contact.email, LIMITS.email)) errs.push('Email is too long.')
    return errs
  }
  return validateContact(payload.contact)
}

// Shared with email.ts's admin notification template, which resolves a
// submitter's chosen contact method to this same label.
export const PREFERRED_CONTACT_LABELS: Record<string, string> = {
  phone: 'Phone call',
  text: 'Text message',
  email: 'Email',
}
