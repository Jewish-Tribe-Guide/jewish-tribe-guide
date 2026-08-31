import type { NextRequest } from 'next/server'
import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { countCategoryFieldUsage } from '@/lib/resourceStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

type Body = {
  address?: boolean
  phone?: boolean
  fieldKeys?: string[]
}

// POST /api/admin/categories/:id/field-usage — how many of this category's
// listings currently have data in the given field(s). The category editor
// calls this before removing a field (or turning off address/phone) on an
// existing category, so it can warn the admin how much data would be
// orphaned before they save. Read-only; admin only.
export async function POST(request: NextRequest, ctx: RouteContext<'/api/admin/categories/[id]/field-usage'>) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  try {
    const usage = await countCategoryFieldUsage(community.slug, id, body)
    return Response.json({ ok: true, usage })
  } catch (err) {
    console.error('[admin/categories/:id/field-usage] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not check existing listings.'] }, { status: 502 })
  }
}
