import { getAdminUser } from '@/lib/adminAuth'
import { listCategories, createCategory } from '@/lib/categoryStore'
import { isHttpUrl } from '@/lib/validation'
import type { CategoryCapabilities, CategoryField, CategoryKind } from '@/lib/categories'
import { getDefaultCommunity } from '@/lib/communityStore'

// GET /api/admin/categories — every category (resolved config, incl. fields and
// capabilities) for the admin category manager. Admin only. The public
// GET /api/categories serves the same data to the site; this route exists so the
// manager can require auth and evolve independently.
export async function GET(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const categories = await listCategories((await getDefaultCommunity()).slug)
    return Response.json({ ok: true, categories })
  } catch (err) {
    console.error('[admin/categories] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load categories.'] }, { status: 502 })
  }
}

type CreateBody = {
  label?: string
  pluralLabel?: string
  icon?: string
  description?: string
  sortOrder?: number
  fields?: CategoryField[]
  kind?: CategoryKind
  hasAddress?: boolean
  hasPhone?: boolean
  upvotesEnabled?: boolean
  capabilities?: Partial<CategoryCapabilities>
  externalLink?: { label: string; url: string } | null
  cardImageUrl?: string | null
  cardTextColor?: string | null
}

// POST /api/admin/categories — create a category directly (the admin equivalent
// of approving a suggestion, but with full control over fields + capabilities).
export async function POST(request: Request) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  if (!body.label?.trim()) {
    return Response.json({ ok: false, errors: ['Category name is required.'] }, { status: 400 })
  }
  if (body.externalLink && !isHttpUrl(body.externalLink.url)) {
    return Response.json({ ok: false, errors: ['The external link must be a valid http(s) URL.'] }, { status: 400 })
  }
  if (body.cardImageUrl && !isHttpUrl(body.cardImageUrl)) {
    return Response.json({ ok: false, errors: ['The card image must be a valid http(s) URL.'] }, { status: 400 })
  }

  try {
    const category = await createCategory({
      label: body.label,
      pluralLabel: body.pluralLabel,
      icon: body.icon,
      description: body.description,
      sortOrder: body.sortOrder,
      fields: body.fields,
      kind: body.kind,
      hasAddress: body.hasAddress,
      hasPhone: body.hasPhone,
      upvotesEnabled: body.upvotesEnabled,
      capabilities: body.capabilities,
      externalLink: body.externalLink,
      cardImageUrl: body.cardImageUrl,
      cardTextColor: body.cardTextColor,
    })
    return Response.json({ ok: true, category })
  } catch (err) {
    console.error('[admin/categories] POST failed:', err)
    const message = err instanceof Error ? err.message : 'Could not create category.'
    return Response.json({ ok: false, errors: [message] }, { status: 502 })
  }
}
