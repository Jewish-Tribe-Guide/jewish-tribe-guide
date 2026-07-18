import { listPublishedForms } from '@/lib/formStore'

// GET /api/forms — published content for every form (Request Support,
// Volunteer). Public read; drafts are never included here. The live wizards
// fetch this via useForms.ts, falling back to src/data/forms.js if it fails.
export async function GET() {
  try {
    const forms = await listPublishedForms()
    return Response.json({ ok: true, forms })
  } catch (err) {
    console.error('[forms] GET failed:', err)
    return Response.json(
      { ok: false, errors: ['Could not load forms. Please try again.'] },
      { status: 502 },
    )
  }
}
