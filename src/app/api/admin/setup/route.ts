import { reportServerError } from '@/lib/serverError'
import { adminRead } from '@/lib/adminRoute'
import { getSetupState } from '@/lib/setupStore'

// GET /api/admin/setup — what To do's "Set up your guide" ticks off (see
// setup.ts): a logo, a second admin, a category with places, the home
// page's words. Admin only.
export const GET = adminRead(async (_request: Request, { community }) => {
  try {
    return Response.json({ ok: true, setup: await getSetupState(community) })
  } catch (err) {
    reportServerError('[admin/setup] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the setup.'] }, { status: 502 })
  }
})
