import { hospitals } from '@/data/hospitals'
import type { ContactHospitalData } from '@/types'

// ── Request types ──────────────────────────────────────────────────────────────

export type RequestType =
  | 'Meals'
  | 'Transportation'
  | 'Visitors'
  | 'Family Housing'
  | 'Direct Support'

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
  'Form Data (JSON)',
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
  const errs: string[] = []
  if (!payload.requestType) errs.push('Request type is required.')
  const c = payload.contact
  if (!c || !c.fullName?.trim()) errs.push('Name is required.')
  if (!c?.phone?.trim() && !c?.email?.trim())
    errs.push('Phone or email is required.')
  return errs
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
