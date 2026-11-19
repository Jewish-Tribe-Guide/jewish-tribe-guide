import { adminRead, adminWrite } from '@/lib/adminRoute'
import { MissingHiddenColumnError, listChangeLogUncached, setChangeHidden } from '@/lib/changesStore'
import { whatChanged } from '@/lib/whatChanged'

// The admin's What changed (step 7a): every change visitors can see, and the
// hidden ones, newest first. PATCH hides one (all the log rows it's made of)
// or shows it again. Admin only.

export const GET = adminRead(async (_request: Request, { community }) => {
  try {
    const rows = await listChangeLogUncached(community.slug)
    return Response.json({ ok: true, changes: whatChanged(rows, community.timezone, { includeHidden: true }), timezone: community.timezone })
  } catch (err) {
    console.error('[admin/changes] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the changes.'] }, { status: 502 })
  }
})

// The page and Today's block are cached; the wrapper drops them so it shows.
export const PATCH = adminWrite(async (request: Request, { community }) => {
  let body: { rowIds?: unknown; hidden?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }
  const { rowIds, hidden } = body
  if (!Array.isArray(rowIds) || rowIds.length === 0 || rowIds.length > 50 || !rowIds.every((id) => Number.isInteger(id) && id > 0) || typeof hidden !== 'boolean') {
    return Response.json({ ok: false, errors: ['Say which change, and whether to hide it.'] }, { status: 400 })
  }

  try {
    // Only this community's rows: the update is filtered by it.
    await setChangeHidden(community.slug, rowIds as number[], hidden)
  } catch (err) {
    if (err instanceof MissingHiddenColumnError) return Response.json({ ok: false, errors: [err.message] }, { status: 409 })
    console.error('[admin/changes] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not save.'] }, { status: 502 })
  }
  return Response.json({ ok: true })
})
