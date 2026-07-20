// ─────────────────────────────────────────────────────────────────────────────
// Inbox types.
//
// Client-safe (no Supabase import) — read by both the /inbox page and the
// server store. Mirrors the categories.ts / categoryStore.ts split: types here,
// service-role reads/writes in formResponseStore.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { ContactHospitalData } from '@/types'
import type { RequestType } from './requests'

/** The inbox's own grouping — coarser than RequestType (Volunteer Edit and
 *  Volunteer Removal share one area), and mirrors the Sheets tab layout in
 *  requests.ts so admins moving off Sheets land somewhere familiar. */
export type InboxTab = 'support' | 'volunteers' | 'volunteerChanges' | 'feedback'

export const INBOX_TABS: InboxTab[] = ['support', 'volunteers', 'volunteerChanges', 'feedback']

export const INBOX_TAB_LABELS: Record<InboxTab, string> = {
  support: 'Support',
  volunteers: 'Volunteers',
  volunteerChanges: 'Volunteer changes',
  feedback: 'Feedback',
}

/** Which RequestType(s) populate each tab. */
export const INBOX_TAB_REQUEST_TYPES: Record<InboxTab, RequestType[]> = {
  support: ['Direct Support'],
  volunteers: ['Volunteer'],
  volunteerChanges: ['Volunteer Edit', 'Volunteer Removal'],
  feedback: ['Feedback'],
}

export function inboxTabForRequestType(type: RequestType): InboxTab {
  for (const tab of INBOX_TABS) {
    if (INBOX_TAB_REQUEST_TYPES[tab].includes(type)) return tab
  }
  // Unreachable while RequestType stays a closed union covered above — but a
  // future added type without a tab mapping shouldn't crash the inbox.
  return 'support'
}

/** One row as returned by GET /api/inbox — mirrors the form_response table. */
export type InboxResponse = {
  id: string
  requestId: string
  requestType: RequestType
  contact: ContactHospitalData
  data: Record<string, unknown>
  status: 'new' | 'handled'
  createdAt: string
  handledAt: string | null
}
