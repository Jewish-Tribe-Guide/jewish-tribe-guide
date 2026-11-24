import type { ResourceRow, SubmissionRow } from '@/types'
import type { CategoryConfig } from './categories'
import { getAdminClient } from './supabase/admin'
import { FINDING_SOURCES, findingFrom, type Finding, type FindingJob } from './watchFindings'
import { readAll } from '@/lib/readAll'

// What the job pages read of the suggestions their watches filed
// (watchFindings.ts): the ones waiting, as Findings, and when each place's
// last one was decided, so a place whose finding the admin approved or
// skipped leaves To check at once rather than at the next morning's read.

/** When a place's last finding from this job was decided, and how. */
export type Decided = { at: string; status: 'approved' | 'rejected' }

export async function jobFindings(
  community: string,
  job: FindingJob,
  categories: readonly CategoryConfig[],
): Promise<{ findings: Finding[]; decided: Map<string, Decided> }> {
  const supabase = getAdminClient()
  // Every watch of this job's, in one read each: waiting (whole) and
  // decided (only when, and how: a decided one carries the page it was
  // read from, which isn't needed). One read for all the job's watches,
  // not one a watch (Nov 23: Sentry's N+1 on the kosher job's three).
  const names = FINDING_SOURCES[job]
  const read = async <T,>(waiting: boolean): Promise<T[]> => {
    const { data, error } = await readAll((from, to) => {
      const q = supabase
        .from('submission')
        .select(waiting ? '*' : 'target_id,status,reviewed_at,submitted_by')
        .eq('community_id', community)
        .eq('target_type', 'listing')
        .in('submitted_by->>name', [...names])
      return (waiting ? q.eq('status', 'pending').order('created_at', { ascending: true }) : q.neq('status', 'pending')).order('id').range(from, to)
    })
    if (error) throw new Error(`Couldn’t read the findings: ${error.message}`)
    return (data ?? []) as T[]
  }
  // In the order of the job's watches, as when each was read on its own.
  const byWatch = <T extends { submitted_by?: unknown }>(rows: T[]) => {
    const at = (r: T) => names.indexOf((r.submitted_by as { name?: string } | null)?.name ?? '')
    return rows.map((r, i) => [r, i] as const).sort(([a, i], [b, j]) => at(a) - at(b) || i - j).map(([r]) => r)
  }
  const [waitingRows, doneRows] = await Promise.all([
    read<SubmissionRow>(true),
    read<Pick<SubmissionRow, 'target_id' | 'status' | 'reviewed_at' | 'submitted_by'>>(false),
  ])
  const pending = byWatch(waitingRows)
  const decided = new Map<string, Decided>()
  for (const s of doneRows) {
    if (s.status === 'pending' || !s.target_id || !s.reviewed_at) continue
    const was = decided.get(s.target_id)
    if (!was || was.at < s.reviewed_at) decided.set(s.target_id, { at: s.reviewed_at, status: s.status })
  }

  const ids = [...new Set(pending.map((s) => s.target_id).filter((id): id is string => !!id))]
  const current = new Map<string, ResourceRow>()
  if (ids.length) {
    const { data, error } = await supabase.from('resource').select('*').eq('community_id', community).in('id', ids)
    if (error) throw new Error(`Couldn’t read the listings: ${error.message}`)
    for (const r of (data ?? []) as ResourceRow[]) current.set(r.id, r)
  }
  const fieldsOf = (category: string | undefined) => categories.find((c) => c.id === category)?.detailFields ?? []
  const findings = pending.map((s) => {
    const row = s.target_id ? current.get(s.target_id) ?? null : null
    return findingFrom(s, row, fieldsOf(row?.category ?? (s.payload as { category?: string }).category))
  })
  return { findings, decided }
}
