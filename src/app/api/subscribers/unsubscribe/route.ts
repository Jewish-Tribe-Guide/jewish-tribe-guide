import { deleteSubscriberByToken } from '@/lib/subscriberStore'

// GET /api/subscribers/unsubscribe?token=... — the link every subscriber
// notification carries (see subscriberEmail.ts). A plain GET rather than a
// form/POST: it's meant to work as a one-click link straight from an email
// client, and removing a subscription has no meaningful "undo" to protect
// against a stray re-click — clicking it again once the row is already gone
// just finds nothing to delete.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')
  if (!token) return htmlResponse('Missing unsubscribe link.', 400)

  try {
    await deleteSubscriberByToken(token)
  } catch (err) {
    console.error('[subscribers] unsubscribe failed:', err)
    return htmlResponse('Something went wrong. Please try again.', 502)
  }

  // Whether a row actually existed or not, the outcome the visitor cares
  // about is the same: this address will not get any more of these emails.
  return htmlResponse("You're unsubscribed. You won't get any more of these emails.", 200)
}

function htmlResponse(message: string, status: number): Response {
  return new Response(
    `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#334155;">
      <p>${message}</p>
    </body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}
