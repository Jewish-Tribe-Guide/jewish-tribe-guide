import { getAdminClient } from '@/lib/supabase/admin'

// POST /api/resource/:id/confirm
// Records that a visitor verified the community-curated info is still accurate.
// Writes confirmedAt into details (same pattern as googleSyncedAt) — no separate
// column needed, surfaces automatically via the normalizeRow spread.
export async function POST(_request: Request, ctx: RouteContext<'/api/resource/[id]/confirm'>) {
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
