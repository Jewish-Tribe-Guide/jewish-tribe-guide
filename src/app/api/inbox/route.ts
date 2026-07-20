import { getInboxViewer } from '@/lib/inboxAuth'
import { listFormResponses } from '@/lib/formResponseStore'

// GET /api/inbox — every form response (support, volunteer, volunteer
// changes, feedback), newest first. Inbox-viewer only (INBOX_EMAILS), a
// separate allowlist from admin — see inboxAuth.ts. The /inbox page groups
// these into tabs client-side (see lib/inbox.ts).
export async function GET(request: Request) {
  const viewer = await getInboxViewer(request)
  if (!viewer) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const responses = await listFormResponses()
    return Response.json({ ok: true, responses })
  } catch (err) {
    console.error('[inbox] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the inbox.'] }, { status: 502 })
  }
}
