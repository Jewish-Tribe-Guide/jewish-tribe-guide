import { listCategories } from '@/lib/categoryStore'

// GET /api/categories — all categories (for the directory index, forms, and the
// generic card renderer). Public read.
export async function GET() {
  try {
    const categories = await listCategories()
    return Response.json({ ok: true, categories })
  } catch (err) {
    console.error('[categories] GET failed:', err)
    return Response.json(
      { ok: false, errors: ['Could not load categories. Please try again.'] },
      { status: 502 },
    )
  }
}
