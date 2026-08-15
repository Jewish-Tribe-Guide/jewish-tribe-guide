import type { NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/adminAuth'
import { countFieldOptionUsage } from '@/lib/resourceStore'

type Body = {
  renames: { fieldKey: string; oldValue: string; newValue: string }[]
}

// POST /api/admin/categories/:id/option-usage — how many of this category's
// listings currently store the OLD value of a select/tags field option the
// admin just renamed. The category editor calls this when it detects what
// looks like an option rename (one value removed, one added, same field), so
// it can offer to cascade the rename into existing listings' data instead of
// silently orphaning them. Read-only; admin only.
export async function POST(request: NextRequest, ctx: RouteContext<'/api/admin/categories/[id]/option-usage'>) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }
  if (!Array.isArray(body.renames) || body.renames.length === 0) {
    return Response.json({ ok: true, usage: [] })
  }

  try {
    const usage = await countFieldOptionUsage(id, body.renames)
    return Response.json({ ok: true, usage })
  } catch (err) {
    console.error('[admin/categories/:id/option-usage] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not check existing listings.'] }, { status: 502 })
  }
}
