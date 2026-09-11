import { updateSubscriberByToken } from '@/lib/subscriberStore'

type Body = {
  token?: string
  categories?: string[] | null
  notifyAdd?: boolean
  notifyClosure?: boolean
}

// PATCH /api/subscribers/manage — the save action behind the "Manage your
// subscription" page every notification links to. Unlike POST
// /api/subscribers (the public signup form, which only ever merges/widens —
// see subscriberStore's own doc), this is a real replace: someone who opened
// their own manage link with their own token gets exactly what they submit,
// including narrowing a category or turning a notify kind off.
export async function PATCH(request: Request) {
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  if (!body.token) {
    return Response.json({ ok: false, errors: ['Missing token.'] }, { status: 400 })
  }

  const notifyAdd = body.notifyAdd ?? true
  const notifyClosure = body.notifyClosure ?? true
  if (!notifyAdd && !notifyClosure) {
    return Response.json({ ok: false, errors: ['Pick at least one thing to be notified about.'] }, { status: 400 })
  }

  try {
    const found = await updateSubscriberByToken(body.token, {
      categories: Array.isArray(body.categories) ? body.categories : null,
      notifyAdd,
      notifyClosure,
    })
    if (!found) {
      return Response.json({ ok: false, errors: ['This link is no longer valid.'] }, { status: 404 })
    }
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[subscribers/manage] update failed:', err)
    return Response.json({ ok: false, errors: ['Something went wrong. Please try again.'] }, { status: 502 })
  }
}
