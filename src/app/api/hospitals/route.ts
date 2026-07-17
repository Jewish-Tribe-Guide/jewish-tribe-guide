import { listHospitals } from '@/lib/hospitalStore'

// GET /api/hospitals — the hospital list (with per-hospital "Jewish life" info)
// for the patient module's map pins, "About Your Hospital" pages, and the
// volunteer/support forms. Empty for a non-hospital community.
export async function GET() {
  try {
    const hospitals = await listHospitals()
    return Response.json({ ok: true, hospitals })
  } catch (err) {
    console.error('[hospitals] GET failed:', err)
    return Response.json({ ok: false, hospitals: [] }, { status: 502 })
  }
}
