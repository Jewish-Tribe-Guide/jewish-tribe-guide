// ─────────────────────────────────────────────────────────────────────────────
// Inbox types.
//
// Client-safe (no Supabase import) — read by both the /inbox page and the
// server store. Mirrors the categories.ts / categoryStore.ts split: types here,
// service-role reads/writes in formResponseStore.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { ContactHospitalData } from '@/types'
import type { RequestType } from './requests'

/** /inbox is scoped to hospital-facing concerns only — Feedback and any
 *  custom admin-created form live in /admin's Responses tab instead (see
 *  ResponsesManager.tsx), not here. Coarser than RequestType (Volunteer Edit
 *  and Volunteer Removal share one area), mirroring the Sheets tab layout in
 *  requests.ts so admins moving off Sheets land somewhere familiar. */
export type InboxTab = 'support' | 'volunteers' | 'volunteerChanges'

export const INBOX_TABS: InboxTab[] = ['support', 'volunteers', 'volunteerChanges']

export const INBOX_TAB_LABELS: Record<InboxTab, string> = {
  support: 'Support',
  volunteers: 'Volunteers',
  volunteerChanges: 'Volunteer changes',
}

/** Which RequestType(s) populate each tab. Also doubles as the explicit
 *  allowlist the server queries by (see GET /api/inbox) — Feedback and
 *  custom-form responses (form_id not null) are never fetched for /inbox in
 *  the first place, so there's no fallback bucket to get this wrong. */
export const INBOX_TAB_REQUEST_TYPES: Record<InboxTab, RequestType[]> = {
  support: ['Direct Support'],
  volunteers: ['Volunteer'],
  volunteerChanges: ['Volunteer Edit', 'Volunteer Removal'],
}

export function inboxTabForRequestType(type: string): InboxTab {
  for (const tab of INBOX_TABS) {
    if ((INBOX_TAB_REQUEST_TYPES[tab] as string[]).includes(type)) return tab
  }
  // Unreachable in practice — GET /api/inbox only ever returns the types
  // listed above — but a future gap shouldn't crash the inbox.
  return 'support'
}

/** One row as returned by GET /api/inbox or GET /api/admin/responses —
 *  mirrors the form_response table. `requestType` is one of the 5 built-in
 *  strings for Support/Volunteer/VolunteerChanges/Feedback, or a custom
 *  form's title (free text) when `formId` is set. */
export type InboxResponse = {
  id: string
  requestId: string
  requestType: string
  /** Set only for a custom admin-created form's response — the stable
   *  grouping key (see ResponsesManager.tsx), since a form's title can be
   *  renamed after submissions already exist. Null for every built-in type. */
  formId: string | null
  contact: ContactHospitalData
  data: Record<string, unknown>
  status: 'new' | 'handled'
  createdAt: string
  handledAt: string | null
}
