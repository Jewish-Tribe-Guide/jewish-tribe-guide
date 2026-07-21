import { listHomeSections } from '@/lib/homeSectionStore'

// GET /api/home-sections — the home screen's section grouping (title + which
// cards belong to each, in order). Public read.
export async function GET() {
  try {
    const sections = await listHomeSections()
    return Response.json({ ok: true, sections })
  } catch (err) {
    console.error('[home-sections] GET failed:', err)
    return Response.json(
      { ok: false, errors: ['Could not load home sections. Please try again.'] },
      { status: 502 },
    )
  }
}
