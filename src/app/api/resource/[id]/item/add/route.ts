import { reportServerError } from '@/lib/serverError'
import { after } from 'next/server'
import { submitListingUpdate } from '@/lib/submissionStore'
import { sendSubmissionNotification } from '@/lib/email'
import { itemsField } from '@/lib/listingView'
import { itemEntry } from '@/lib/itemNames'
import { addedItemName, additionSubmission, alreadyListed, cleanItemName, itemMarks, itemWording } from '@/lib/itemMarks'
import { editableListing, failsBotCheck, openListingWrite } from '@/lib/listingWrite'

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
  const opened = await openListingWrite(request, ctx)
  if (opened instanceof Response) return opened
  const { id, body } = opened
  const name = cleanItemName(body?.item)
  if (!body || !name) return Response.json({ ok: false, error: 'What did you see? A short name, like “Challah”.' }, { status: 400 })
  const bot = await failsBotCheck(request, body)
  if (bot) return bot

  try {
    // The listing's own community, from the row: a live one only.
    const found = await editableListing(id, itemsField)
    if (found instanceof Response) return found
    const { community, listing, category, field } = found

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
    const submission = await submitListingUpdate(community.slug, id, additionSubmission(category, listing, field.key, name, sometimes), note, null)
    after(() => sendSubmissionNotification(submission).catch((err) => reportServerError('[item/add] Admin notification failed:', err)))
    return Response.json({ ok: true, item: named, sometimes })
  } catch (err) {
    reportServerError('[item/add] could not file the addition:', err)
    return Response.json(FAILED, { status: 502 })
  }
}
