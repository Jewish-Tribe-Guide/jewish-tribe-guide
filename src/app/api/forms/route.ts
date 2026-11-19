import { listPublishedForms } from '@/lib/formStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/forms — published content for every form. Drafts are never
// included. Public read.
//
// No screen fetches this: every page gets it from the [community] layout
// (loadCommunityContent). It stays for the e2e suites, which read it to know
// what the site should show instead of hardcoding it, and warm the cache
// through it (Nov 18, review item 43). Read by e2e/warmup.setup.ts,
// e2e-form/form-submission.spec.ts.
export async function GET(request: Request) {
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const forms = await listPublishedForms(community.slug)
    return Response.json({ ok: true, forms })
  } catch (err) {
    console.error('[forms] GET failed:', err)
    return Response.json(
      { ok: false, errors: ['Could not load forms. Please try again.'] },
      { status: 502 },
    )
  }
}
