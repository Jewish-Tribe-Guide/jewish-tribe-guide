import { after } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, clientIp } from '@/lib/rateLimit'
import { isHoneypotTripped } from '@/lib/honeypot'
import { verifyTurnstile } from '@/lib/turnstile'
import { ui } from '@/lib/uiConfig'
import { resolveCapabilities } from '@/lib/categories'
import { getResourceById } from '@/lib/resourceStore'
import { getCategoryById } from '@/lib/categoryStore'
import { submitListingUpdate } from '@/lib/submissionStore'
import { sendSubmissionNotification } from '@/lib/email'
import { itemsField } from '@/lib/listingView'
import { itemEntry } from '@/lib/itemNames'
import { addedItemName, additionSubmission, alreadyListed, cleanItemName, itemMarks, itemWording } from '@/lib/itemMarks'
import { UUID } from '@/lib/itemMarkRoutes'

// POST /api/resource/:id/item/add   { item, sometimes?, from?, turnstileToken, company }
// "+ Add an item" on an opened listing (agreed Oct 1). An item is a new
// claim about what a place carries, so unlike "Still here" it doesn't show
// at once: it's an edit suggestion, the listing with one item more, for an
// admin to check. Approving it dates the item "seen" that day, as any
// approved addition is.
//
// Held to what the submissions route holds edits to: the bot check, its
// rate limit, and the community's and the category's "edits allowed". The
// listing and its item list are read here, never taken from the browser.
// An item it already has, under any of its names, isn't filed: the answer
// says which, so the page can count it as that item's "Still here".

const FAILED = { ok: false, error: 'That didn’t send. Please try again.' }

export async function POST(request: Request, ctx: RouteContext<'/api/resource/[id]/item/add'>) {
  const limited = await enforceRateLimit(request, 'submissions', { limit: 10, windowSec: 60 })
  if (limited) return limited

  const { id } = await ctx.params
  if (!UUID.test(id)) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (body && isHoneypotTripped(body)) return Response.json({ ok: true })
  const name = cleanItemName(body?.item)
  if (!body || !name) return Response.json({ ok: false, error: 'What did you see? A short name, like “Challah”.' }, { status: 400 })
  if (!(await verifyTurnstile(typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined, clientIp(request)))) {
    return Response.json({ ok: false, code: 'turnstile', error: 'Verification failed. Please try again.' }, { status: 403 })
  }
  if (!ui.contributions.edit) return Response.json({ ok: false, error: 'This action is not available.' }, { status: 403 })

  try {
    // The listing's own community, from the row: a live one only.
    const { data: row } = await getAdminClient()
      .from('resource')
      .select('community_id')
      .eq('id', id)
      .eq('status', 'approved')
      .maybeSingle<{ community_id: string }>()
    const listing = row ? await getResourceById(id, row.community_id) : null
    const category = listing && row ? await getCategoryById(row.community_id, listing.category) : null
    const field = category ? itemsField(category) : null
    if (!listing || !category || !field || !row) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })
    if (!resolveCapabilities(category.capabilities).edit) {
      return Response.json({ ok: false, error: 'This action is not available for this category.' }, { status: 403 })
    }

    const listed = alreadyListed(itemMarks(listing, field), name)
    if (listed) return Response.json({ ok: true, already: { item: listed.name, field: listed.key } })

    const sometimes = body.sometimes === true
    const named = addedItemName(name)
    const say = itemWording(field)
    // Where it was said, for the admin: the listing's own "+ Add an item",
    // or a question the guide had nothing for ("Know where to find it?").
    const where = body.from === 'question' ? 'Said where to find it, from a question the guide had nothing for' : `Tapped “${say.add}” on the listing`
    const note = [
      `${where}: ${named}${sometimes ? ` (${say.sometimes})` : ''}.`,
      ...(itemEntry(name) ? [] : ['A name not on the item list yet.']),
    ].join(' ')
    const submission = await submitListingUpdate(row.community_id, id, additionSubmission(category, listing, field.key, name, sometimes), note, null)
    after(() => sendSubmissionNotification(submission).catch((err) => console.error('[item/add] Admin notification failed:', err)))
    return Response.json({ ok: true, item: named, sometimes })
  } catch (err) {
    console.error('[item/add] could not file the addition:', err)
    return Response.json(FAILED, { status: 502 })
  }
}
