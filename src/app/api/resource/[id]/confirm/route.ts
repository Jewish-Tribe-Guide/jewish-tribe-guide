import { getAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit } from '@/lib/rateLimit'

// POST /api/resource/:id/confirm
// Records that a visitor verified the community-curated info is still accurate.
// Writes confirmedAt into details (same pattern as googleSyncedAt) — no separate
// column needed, surfaces automatically via the normalizeRow spread.
export async function POST(request: Request, ctx: RouteContext<'/api/resource/[id]/confirm'>) {
  const limited = await enforceRateLimit(request, 'confirm', { limit: 20, windowSec: 60 })
  if (limited) return limited

  const { id } = await ctx.params

  const db = getAdminClient()
  const { data: row, error: fetchErr } = await db
    .from('resource')
    .select('details')
    .eq('id', id)
    .maybeSingle()

  if (fetchErr || !row) {
    return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })
  }

  const confirmedAt = new Date().toISOString()
  const newDetails = { ...(row.details as Record<string, unknown>), confirmedAt }

  const { error } = await db.from('resource').update({ details: newDetails }).eq('id', id)
  if (error) {
    console.error('[confirm] update failed:', error)
    return Response.json({ ok: false, error: 'Could not save confirmation.' }, { status: 502 })
  }

  return Response.json({ ok: true, confirmedAt })
}

// DELETE /api/resource/:id/confirm
// Undoes a confirmation made by mistake, restoring whatever confirmedAt (or
// none) was in place before it — body: { previousConfirmedAt?: string }.
export async function DELETE(request: Request, ctx: RouteContext<'/api/resource/[id]/confirm'>) {
  const limited = await enforceRateLimit(request, 'confirm', { limit: 20, windowSec: 60 })
  if (limited) return limited

  const { id } = await ctx.params
  const body = (await request.json().catch(() => ({}))) as { previousConfirmedAt?: string }

  const db = getAdminClient()
  const { data: row, error: fetchErr } = await db
    .from('resource')
    .select('details')
    .eq('id', id)
    .maybeSingle()

  if (fetchErr || !row) {
    return Response.json({ ok: false, error: 'Not found.' }, { status: 404 })
  }

  const newDetails = { ...(row.details as Record<string, unknown>) }
  if (body.previousConfirmedAt) {
    newDetails.confirmedAt = body.previousConfirmedAt
  } else {
    delete newDetails.confirmedAt
  }

  const { error } = await db.from('resource').update({ details: newDetails }).eq('id', id)
  if (error) {
    console.error('[confirm] undo failed:', error)
    return Response.json({ ok: false, error: 'Could not undo confirmation.' }, { status: 502 })
  }

  return Response.json({ ok: true, confirmedAt: body.previousConfirmedAt ?? null })
}
