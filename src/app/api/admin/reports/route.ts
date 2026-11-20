import { reportServerError } from '@/lib/serverError'
import { adminRead } from '@/lib/adminRoute'
import { REPORT_PERIODS, type ReportPeriod } from '@/lib/reports'
import { getReport } from '@/lib/reportsStore'

// GET /api/admin/reports?period=week|month|year — the Reports page: listing
// views, the places opened most, what was decided and how many searches
// found nothing (see reports.ts). Admin only. A month when no period is given.
export const GET = adminRead(async (request: Request, { community }) => {
  const asked = new URL(request.url).searchParams.get('period') ?? 'month'
  if (!REPORT_PERIODS.includes(asked as ReportPeriod)) {
    return Response.json({ ok: false, errors: ['period must be week, month or year.'] }, { status: 400 })
  }

  try {
    const report = await getReport(community, asked as ReportPeriod)
    return Response.json({ ok: true, report })
  } catch (err) {
    reportServerError('[admin/reports] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the reports.'] }, { status: 502 })
  }
})
