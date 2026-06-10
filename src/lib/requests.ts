import { hospitals } from '@/data/hospitals'
import type { ContactHospitalData, VolunteerData, VolunteerRemovalData } from '@/types'
import { validateContact } from './validation'

// ── Request types ──────────────────────────────────────────────────────────────

export type RequestType =
  | 'Meals'
  | 'Transportation'
  | 'Visitors'
  | 'Family Housing'
  | 'Direct Support'
  | 'Volunteer'
  | 'Volunteer Edit'
  | 'Volunteer Removal'

// The payload every form POSTs to /api/requests. `contact` carries the shared
// name/phone/email/hospital fields; `formData` is the request-type-specific blob
// that gets stored verbatim as JSON (system of record keeps everything).
export type SubmissionPayload = {
  requestType: RequestType
  contact: ContactHospitalData
  formData: Record<string, unknown>
}

// The 10 columns, in order, that get appended to the sheet.
export const SHEET_COLUMNS = [
  'Timestamp',
  'Request ID',
  'Request Type',
  'Hospital',
  'Name',
  'Phone',
  'Email',
  'Status',
  'Assigned To',
  'Details (JSON)',
] as const

// ── Helpers ─────────────────────────────────────────────────────────────────

export function hospitalName(hospitalId: string): string {
  return hospitals.find((h) => h.id === hospitalId)?.name ?? hospitalId
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
  return validateContact(payload.contact)
}

// Builds the row (matching SHEET_COLUMNS order) for a validated submission.
export function buildSheetRow(
  payload: SubmissionPayload,
  requestId: string,
  timestamp: string,
): string[] {
  const { contact, requestType, formData } = payload
  return [
    timestamp,
    requestId,
    requestType,
    hospitalName(contact.hospitalId),
    contact.fullName,
    contact.phone,
    contact.email,
    'New',
    '',
    JSON.stringify(formData),
  ]
}

// ── Volunteer signups (separate "Volunteers" tab) ────────────────────────────
// Volunteer submissions come through the same /api/requests endpoint but have a
// different shape (no hospital scoping, rich "ways to help" details), so they
// get their own tab and column layout rather than the generic Requests row.

export const VOLUNTEER_SHEET_TAB = 'Volunteers'

export const VOLUNTEER_SHEET_COLUMNS = [
  'Timestamp',
  'Request ID',
  'Name',
  'Phone',
  'Email',
  'Preferred Contact',
  'Ways to Help',
  'Areas',
  'Availability',
  'Has Car',
  'Notes',
  'Details (JSON)',
] as const

const WAYS_TO_HELP_LABELS: Record<string, string> = {
  meals: 'Preparing or delivering meals',
  visiting: 'Visiting patients (Bikur Cholim)',
  transportation: 'Transportation / rides',
  housing: 'Hosting family in your home',
  other: 'Other',
}

const AVAILABILITY_LABELS: Record<string, string> = {
  weekdayMornings: 'Weekday mornings',
  weekdayAfternoons: 'Weekday afternoons',
  weekdayEvenings: 'Weekday evenings',
  weekends: 'Weekends',
  flexible: 'Flexible / varies',
}

const PREFERRED_CONTACT_LABELS: Record<string, string> = {
  phone: 'Phone call',
  text: 'Text message',
  email: 'Email',
}

const HAS_CAR_LABELS: Record<string, string> = {
  yes: 'Yes',
  sometimes: 'Sometimes',
  no: 'No',
}

const ANYWHERE = 'anywhere'

function areaLabel(id: string): string {
  return id === ANYWHERE ? 'Anywhere in the Philadelphia area' : hospitalName(id)
}

// Builds the Volunteers-tab row (matching VOLUNTEER_SHEET_COLUMNS order). The
// service-specific details (visiting/meals/transportation/housing) are kept in a
// trailing JSON column, scoped to whichever help types the volunteer selected.
export function buildVolunteerSheetRow(
  payload: SubmissionPayload,
  requestId: string,
  timestamp: string,
): string[] {
  const { contact } = payload
  const v = payload.formData as unknown as VolunteerData

  const waysToHelp = (v.waysToHelp ?? []).map((code) =>
    code === 'other' && v.waysToHelpOther?.trim()
      ? `Other: ${v.waysToHelpOther.trim()}`
      : WAYS_TO_HELP_LABELS[code] ?? code,
  )

  return [
    timestamp,
    requestId,
    contact.fullName,
    contact.phone,
    contact.email,
    PREFERRED_CONTACT_LABELS[contact.preferredContact] ?? contact.preferredContact ?? '',
    waysToHelp.join(', '),
    (v.hospitals ?? []).map(areaLabel).join(', '),
    (v.availability ?? []).map((code) => AVAILABILITY_LABELS[code] ?? code).join(', '),
    HAS_CAR_LABELS[v.hasCar] ?? v.hasCar ?? '',
    v.notes ?? '',
    JSON.stringify(payload.formData),
  ]
}

// ── Volunteer change-requests ("Volunteer Changes" tab) ──────────────────────
// Both edits and removals land here — distinguished by the leading Change Type
// column — so the admin has a single queue to work through. Edits carry the
// full restated commitment; removals carry only contact info + an optional
// reason. Nothing is mutated automatically: a human acts on each row.

export const VOLUNTEER_CHANGES_SHEET_TAB = 'Volunteer Changes'

export const VOLUNTEER_CHANGES_SHEET_COLUMNS = [
  'Timestamp',
  'Request ID',
  'Change Type',
  'Name',
  'Phone',
  'Email',
  'Preferred Contact',
  'Ways to Help',
  'Areas',
  'Availability',
  'Has Car',
  'Notes / Reason',
  'Details (JSON)',
] as const

// Builds the Volunteer Changes tab row for either a 'Volunteer Edit' or a
// 'Volunteer Removal' payload.
export function buildVolunteerChangeSheetRow(
  payload: SubmissionPayload,
  requestId: string,
  timestamp: string,
): string[] {
  const { contact } = payload

  if (payload.requestType === 'Volunteer Removal') {
    const d = payload.formData as unknown as VolunteerRemovalData
    return [
      timestamp,
      requestId,
      'Removal',
      contact.fullName,
      contact.phone,
      contact.email,
      PREFERRED_CONTACT_LABELS[contact.preferredContact] ?? contact.preferredContact ?? '',
      '', // Ways to Help — not applicable for removals
      '', // Areas
      '', // Availability
      '', // Has Car
      d.reason ?? '',
      JSON.stringify(payload.formData),
    ]
  }

  // 'Volunteer Edit' — full restated commitment (same shape as a signup row).
  const v = payload.formData as unknown as VolunteerData

  const waysToHelp = (v.waysToHelp ?? []).map((code) =>
    code === 'other' && v.waysToHelpOther?.trim()
      ? `Other: ${v.waysToHelpOther.trim()}`
      : WAYS_TO_HELP_LABELS[code] ?? code,
  )

  return [
    timestamp,
    requestId,
    'Edit',
    contact.fullName,
    contact.phone,
    contact.email,
    PREFERRED_CONTACT_LABELS[contact.preferredContact] ?? contact.preferredContact ?? '',
    waysToHelp.join(', '),
    (v.hospitals ?? []).map(areaLabel).join(', '),
    (v.availability ?? []).map((code) => AVAILABILITY_LABELS[code] ?? code).join(', '),
    HAS_CAR_LABELS[v.hasCar] ?? v.hasCar ?? '',
    v.notes ?? '',
    JSON.stringify(payload.formData),
  ]
}
