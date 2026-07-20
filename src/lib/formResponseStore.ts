import { getAdminClient } from './supabase/admin'
import type { ContactHospitalData } from '@/types'
import type { RequestType } from './requests'
import type { InboxResponse } from './inbox'

type FormResponseRow = {
  id: string
  request_id: string
  request_type: RequestType
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
// new code here.
export async function insertFormResponse(input: {
  requestId: string
  requestType: RequestType
  contact: ContactHospitalData
  data: Record<string, unknown>
}): Promise<void> {
  const { error } = await getAdminClient().from('form_response').insert({
    request_id: input.requestId,
    request_type: input.requestType,
    contact: input.contact,
    data: input.data,
  })
  if (error) throw new Error(`Failed to save the request: ${error.message}`)
}

// Every response, newest first. The /inbox page groups these into tabs
// client-side (see inboxTabForRequestType) rather than filtering here — at
// this volume a single fetch is simpler than a growing set of query params.
export async function listFormResponses(): Promise<InboxResponse[]> {
  const { data, error } = await getAdminClient()
    .from('form_response')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to load responses: ${error.message}`)
  return (data as FormResponseRow[]).map(toView)
}
