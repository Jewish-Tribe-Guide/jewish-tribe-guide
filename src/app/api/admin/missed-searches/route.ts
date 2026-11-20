import { reportServerError } from '@/lib/serverError'
import { adminRead } from '@/lib/adminRoute'
import { listCategories } from '@/lib/categoryStore'
import { listApprovedResources } from '@/lib/resourceStore'
import { resolveCapabilities } from '@/lib/categories'
import { neighborhoodsFor } from '@/lib/places'
import { normalizeSearchMiss } from '@/lib/activity'
import { classifyMiss, tallyMisses } from '@/lib/missedSearches'
import { listSearchMissCounts, listSearchMissDismissals, setSearchMissDismissed } from '@/lib/missedSearchStore'

// GET  /api/admin/missed-searches — the "Missed searches" tab: every search
//      that found nothing, most asked first, each run again through today's
//      search (see missedSearches.ts). Admin only.
// POST /api/admin/missed-searches   body: { term, dismissed: boolean }
//      Dismisses a search, or takes the dismissal back.
//
// Searched against what visitors see: the public, active-only categories and
// approved listings. A hidden category's listings answer nothing on the site,
// so they don't count as found here either.

/** The most searches classified in one load. Each is a few searches over
 *  every listing; this keeps a long tail from slowing the tab down. */
const MAX_CLASSIFIED = 300

export const GET = adminRead(async (_request: Request, { community }) => {
  try {
    const [counts, { dismissed, available }, categories, listings] = await Promise.all([
      listSearchMissCounts(community.slug),
      listSearchMissDismissals(community.slug),
      listCategories(community.slug),
      listApprovedResources(community.slug),
    ])
    const tallies = tallyMisses(counts, dismissed)
    const options = { places: neighborhoodsFor(community.slug), now: new Date() }
    const searches = tallies.slice(0, MAX_CLASSIFIED).map((t) => classifyMiss(t, listings, categories, options))
    const addable = categories
      .filter((c) => c.kind === 'listing' && resolveCapabilities(c.capabilities).add)
      .map((c) => ({ id: c.id, label: c.label }))
    return Response.json({ ok: true, searches, total: tallies.length, addable, dismissalsAvailable: available })
  } catch (err) {
    reportServerError('[admin/missed-searches] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load missed searches.'] }, { status: 502 })
  }
})

export const POST = adminRead(async (request: Request, { community }) => {
  let body: { term?: unknown; dismissed?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
  }
  // The same normalising the counter uses, so the key matches the counted one.
  const term = normalizeSearchMiss(body.term)
  if (!term || typeof body.dismissed !== 'boolean') {
    return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
  }

  try {
    await setSearchMissDismissed(community.slug, term, body.dismissed)
    return Response.json({ ok: true })
  } catch (err) {
    reportServerError('[admin/missed-searches] POST failed:', err)
    return Response.json(
      { ok: false, errors: ['Could not save.'] },
      { status: 502 },
    )
  }
})
