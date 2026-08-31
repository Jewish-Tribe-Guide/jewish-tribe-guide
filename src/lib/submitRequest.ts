import type { ContactHospitalData } from '@/types'
import type { RequestType } from './requests'
import { withCommunity } from './useCommunityData'

type SubmitResult = { ok: true; requestId: string }

// Client-side helper used by every intake form. POSTs to /api/requests and
// either resolves with the new request id or throws an Error whose message is
// suitable for display to the user. `requestType` is one of the 5 built-in
// strings for Support/Volunteer/Feedback, or a custom form's title (free
// text) — paired with `formId`, the stable identity, for GenericFormWizard.
export async function submitRequest(
  community: string,
  requestType: RequestType | string,
  contact: ContactHospitalData,
  formData: Record<string, unknown>,
  honeypot = '',
  turnstileToken = '',
  formId?: string,
): Promise<SubmitResult> {
  let res: Response
  try {
    res = await fetch(withCommunity('/api/requests', community), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType, formId, contact, formData, company: honeypot, turnstileToken }),
    })
  } catch {
    throw new Error('Network error. Please check your connection and try again.')
  }

  let body: { ok?: boolean; requestId?: string; errors?: string[] } = {}
  try {
    body = await res.json()
  } catch {
    // fall through to status-based error below
  }

  if (!res.ok || !body.ok) {
    const message = body.errors?.join(' ') || 'Something went wrong. Please try again.'
    throw new Error(message)
  }

  return { ok: true, requestId: body.requestId! }
}
