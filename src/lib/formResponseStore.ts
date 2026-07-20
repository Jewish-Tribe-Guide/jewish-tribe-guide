import { getAdminClient } from './supabase/admin'
import type { ContactHospitalData } from '@/types'
import type { RequestType } from './requests'
import type { InboxResponse } from './inbox'

type FormResponseRow = {
  id: string
  request_id: string
  request_type: string
  form_id: string | null
  contact: ContactHospitalData
  data: Record<string, unknown>
  status: 'new' | 'handled'
  created_at: string
  handled_at: string | null
}

function toView(row: FormResponseRow): InboxResponse {
  return {
    id: row.id,
    requestId: row.request_id,
    requestType: row.request_type,
    formId: row.form_id,
    contact: row.contact,
    data: row.data,
    status: row.status,
    createdAt: row.created_at,
    handledAt: row.handled_at,
  }
}

// Inserts a form response — called from /api/requests as the hard-fail write
// (throws on failure, unlike the Sheets append which is best-effort). Every
// request type stores the same shape, so a new admin-created form needs no
// new code here. `formId` is set only for a custom admin-created form's
// submission (see GenericFormWizard.tsx); every built-in type leaves it unset.
export async function insertFormResponse(input: {
  requestId: string
  requestType: RequestType | string
  formId?: string
  contact: ContactHospitalData
  data: Record<string, unknown>
}): Promise<void> {
  const { error } = await getAdminClient().from('form_response').insert({
    request_id: input.requestId,
    request_type: input.requestType,
    form_id: input.formId ?? null,
    contact: input.contact,
    data: input.data,
  })
  if (error) throw new Error(`Failed to save the request: ${error.message}`)
}

// Every response, newest first, matching the given filter. Exactly one of
// `requestTypes`/`formId` is expected per call site:
//   - /inbox: `{ requestTypes: [...] }` — the explicit hospital-facing
//     allowlist (see INBOX_TAB_REQUEST_TYPES), so Feedback and custom-form
//     rows are never even fetched, not just hidden client-side.
//   - /admin's Feedback tab: `{ requestTypes: ['Feedback'] }`.
//   - /admin's per-form tab: `{ formId: '<form id>' }`.
export async function listFormResponses(
  filter: { requestTypes?: string[]; formId?: string } = {},
): Promise<InboxResponse[]> {
  let query = getAdminClient().from('form_response').select('*')
  if (filter.requestTypes) query = query.in('request_type', filter.requestTypes)
  if (filter.formId) query = query.eq('form_id', filter.formId)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to load responses: ${error.message}`)
  return (data as FormResponseRow[]).map(toView)
}

// Corrects a response's contact info and/or submitted data (e.g. a typo'd
// phone number) — request_id/request_type/status are immutable here, same
// spirit as a category's id. Only the provided keys change.
export async function updateFormResponse(
  id: string,
  patch: { contact?: ContactHospitalData; data?: Record<string, unknown> },
): Promise<InboxResponse | null> {
  const row: Record<string, unknown> = {}
  if (patch.contact !== undefined) row.contact = patch.contact
  if (patch.data !== undefined) row.data = patch.data
  if (Object.keys(row).length === 0) return null

  const { data, error } = await getAdminClient()
    .from('form_response')
    .update(row)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`Failed to update the request: ${error.message}`)
  return data ? toView(data as FormResponseRow) : null
}

// Permanently deletes a response.
export async function deleteFormResponse(id: string): Promise<void> {
  const { error } = await getAdminClient().from('form_response').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete the request: ${error.message}`)
}
