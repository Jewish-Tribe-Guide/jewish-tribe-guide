import { getInboxViewer } from '@/lib/inboxAuth'
import { listFormResponses } from '@/lib/formResponseStore'
import { INBOX_TAB_REQUEST_TYPES } from '@/lib/inbox'

// GET /api/inbox — hospital-facing responses only (support, volunteer,
// volunteer changes), newest first. Inbox-viewer only (INBOX_EMAILS), a
// separate allowlist from admin — see inboxAuth.ts. Feedback and custom
// admin-created forms live in /admin's Responses tab instead — filtered by
// the explicit allowlist below, not just hidden client-side, so they're never
// even fetched here. The /inbox page groups these into tabs client-side
// (see lib/inbox.ts).
const INBOX_REQUEST_TYPES = Object.values(INBOX_TAB_REQUEST_TYPES).flat()

export async function GET(request: Request) {
  const viewer = await getInboxViewer(request)
  if (!viewer) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const responses = await listFormResponses({ requestTypes: INBOX_REQUEST_TYPES })
    return Response.json({ ok: true, responses })
  } catch (err) {
    console.error('[inbox] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the inbox.'] }, { status: 502 })
  }
}
