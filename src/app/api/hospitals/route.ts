import { listHospitals } from '@/lib/hospitalStore'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'

// GET /api/hospitals — the hospital list (with per-hospital "Jewish life" info)
// for the patient module's map pins, "About Your Hospital" pages, and the
// volunteer/support forms. Empty for a non-hospital community.
export async function GET(request: Request) {
  try {
    const community = await resolveCommunity(communitySlugFromRequest(request))
    const hospitals = await listHospitals(community.slug)
    return Response.json({ ok: true, hospitals })
  } catch (err) {
    console.error('[hospitals] GET failed:', err)
    return Response.json({ ok: false, hospitals: [] }, { status: 502 })
  }
}
