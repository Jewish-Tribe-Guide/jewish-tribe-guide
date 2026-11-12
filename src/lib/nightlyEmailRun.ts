import type { ResourceRow, SubmissionRow } from '@/types'
import { getAdminClient } from './supabase/admin'
import { listCommunities } from './communityStore'
import { listCategoriesUncached } from './categoryStore'
import { listWatches } from './watchStore'
import { isNewsletterWatch } from './newsletter'
import { findingFrom, watchNameOf } from './watchFindings'
import { placePath } from './placeLink'
import { NIGHTLY_JOBS, jobAlert, type JobRun } from './jobRuns'
import { statusChangesSince } from './nightNoteStore'
import { recentJobRuns } from './jobRunStore'
import { adminAppUrl, sendNightlyEmail } from './email'
import { buildNightlyEmail, dayIn, waitingRow, type Night, type StoppedRow, type WaitingRow } from './nightlyEmail'
import type { Watch } from './watches'

// The nightly email's run (/api/cron/nightly-email, after the last job):
// for each community, the night gathered from where it already is, then
// one email (nightlyEmail.ts). What waits on To do is the queue itself,
// read now, so a suggestion an admin already decided overnight isn't
// listed; a watch that broke, its failingSince; a job, its runs; Google's
// status changes, night_note (migration 096). Server-only.

/** How far back "last night" reaches. */
const NIGHT_MS = 24 * 3_600_000

/** Filed by a watch or job, not a person: every such name says so. */
export const isAutomated = (s: Pick<SubmissionRow, 'submitted_by'>) => /\(automated\b/.test(watchNameOf(s) ?? '')

const NETWORK = /\b(4\d\d|5\d\d)\b|fetch failed|ENOTFOUND|ECONN|EAI_AGAIN|timed? ?out|abort|certificate|network|socket|DNS/i

/** Why a watch stopped, in a few words. */
export function watchWhy(error: string | null): string {
  return error && NETWORK.test(error) ? 'The page couldn’t be opened' : 'Its page couldn’t be read'
}

/** A watch that broke in the night, as a row. */
export function stoppedWatch(w: Watch, names: ReadonlyMap<string, string>, slug: string): StoppedRow {
  const base = `/${encodeURIComponent(slug)}/admin/watches`
  const place = w.resourceId ? names.get(w.resourceId) : undefined
  const host = (() => {
    try {
      return new URL(w.url).hostname.replace(/^www\./, '')
    } catch {
      return w.url
    }
  })()
  const path = w.resourceId ? `${base}/${placePath(w.resourceId)}` : base
  if (w.kind === 'keystone_list') return { name: w.label || 'Keystone-K’s list', why: watchWhy(w.lastError), kind: 'list', path }
  if (isNewsletterWatch(w)) return { name: place ? `${place}’s newsletter` : w.label || host, why: watchWhy(w.lastError), kind: 'newsletter', path }
  return { name: place ? `${place}’s website` : w.label || host, why: watchWhy(w.lastError), kind: 'website', path }
}

/** The jobs that stopped working last night: their latest run, since
 *  `since`, broke them (jobAlert). The jobs run for the whole site. */
export function stoppedJobs(runs: ReadonlyMap<string, readonly JobRun[]>, since: string, slug: string): StoppedRow[] {
  return NIGHTLY_JOBS.flatMap((job) => {
    // This email's own run is the one going now: the night before's is
    // the one to tell of, a day late, since it couldn't tell of itself.
    const own = job.id === 'nightly-email'
    const list = (runs.get(job.id) ?? []).slice(own ? 1 : 0)
    const from = own ? new Date(Date.parse(since) - NIGHT_MS / 4).toISOString() : since
    if (!list[0] || list[0].startedAt < from) return []
    const alert = jobAlert(job, list)
    if (!alert?.broke) return []
    const last = alert.lines[alert.lines.length - 1].replace(/^[A-Z][a-z]{2} \d{1,2}: /, '')
    return [{ name: `${job.name} (nightly job)`, why: last.charAt(0).toUpperCase() + last.slice(1), kind: 'job' as const, path: `/${encodeURIComponent(slug)}/admin/watches` }]
  })
}

/** What waits on To do from tonight, a row a place, and how many more. */
async function queue(slug: string, since: string, today: string): Promise<{ waiting: WaitingRow[]; earlier: number; people: number }> {
  const db = getAdminClient()
  const { data, error } = await db.from('submission').select('*').eq('community_id', slug).eq('status', 'pending').order('created_at', { ascending: true })
  if (error) throw new Error(`Couldn’t read the queue: ${error.message}`)
  const pending = (data ?? []) as SubmissionRow[]
  const automated = pending.filter(isAutomated)
  const tonight = automated.filter((s) => s.created_at >= since)
  const people = pending.length - automated.length
  const earlier = automated.length - tonight.length

  const listings = tonight.filter((s) => s.target_type === 'listing')
  const ids = [...new Set(listings.map((s) => s.target_id).filter((id): id is string => !!id))]
  const current = new Map<string, ResourceRow>()
  if (ids.length) {
    const { data: rows, error: e } = await db.from('resource').select('*').eq('community_id', slug).in('id', ids)
    if (e) throw new Error(`Couldn’t read the listings: ${e.message}`)
    for (const r of (rows ?? []) as ResourceRow[]) current.set(r.id, r)
  }
  const categories = listings.length ? await listCategoriesUncached(slug) : []
  const toDo = `/${encodeURIComponent(slug)}/admin`

  // A place's findings together, in the order the first of them was filed.
  const groups = new Map<string, { rows: Parameters<typeof waitingRow>[0][number][]; path: string; hoursKeys: Set<string> }>()
  for (const s of tonight) {
    if (s.target_type === 'listing') {
      const row = s.target_id ? current.get(s.target_id) ?? null : null
      const category = categories.find((c) => c.id === (row?.category ?? (s.payload as { category?: string }).category))
      const fields = category?.detailFields ?? []
      const finding = findingFrom(s, row, fields)
      const key = s.target_id ?? `new:${finding.name}`
      const g = groups.get(key) ?? {
        rows: [],
        path: s.target_id ? `${toDo}/watches/${placePath(s.target_id, 'todo')}` : toDo,
        hoursKeys: new Set(fields.filter((f) => f.type === 'hours').map((f) => f.key)),
      }
      g.rows.push({ finding, watchName: watchNameOf(s) })
      groups.set(key, g)
    } else if (s.target_type === 'eruv') {
      const name = String((s.payload as { name?: unknown }).name ?? 'An eruv')
      const key = `eruv:${(s.payload as { eruvId?: string }).eruvId ?? name}`
      if (!groups.has(key)) {
        groups.set(key, {
          rows: [
            {
              finding: { id: s.id, operation: s.operation, targetId: null, name, from: '', says: '', named: null, at: s.created_at, notes: [], lines: [{ key: 'eruv', label: 'Eruv details', before: '', after: '', choosable: false }] },
              watchName: watchNameOf(s),
            },
          ],
          path: toDo,
          hoursKeys: new Set(),
        })
      }
    }
  }
  const waiting = [...groups.entries()].map(([key, g]) => {
    const row = waitingRow(g.rows, { today, path: g.path, hoursKeys: g.hoursKeys })
    return key.startsWith('eruv:') ? { ...row, kind: 'eruv' as const } : row
  })
  return { waiting, earlier, people }
}

/** A community's night. */
async function gatherNight(community: Night['community'] & { timezone: string }, now: Date, runs: ReadonlyMap<string, readonly JobRun[]>): Promise<Night> {
  const since = new Date(now.getTime() - NIGHT_MS).toISOString()
  const today = dayIn(now, community.timezone)
  const [{ waiting, earlier, people }, { watches }, google] = await Promise.all([
    queue(community.slug, since, today),
    listWatches(community.slug),
    statusChangesSince(community.slug, since),
  ])
  const broke = watches.filter((w) => w.active && w.failingSince && w.failingSince >= since)
  const ids = [...new Set(broke.map((w) => w.resourceId).filter((id): id is string => !!id))]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data } = await getAdminClient().from('resource').select('id, name').eq('community_id', community.slug).in('id', ids)
    for (const r of (data ?? []) as { id: string; name: string }[]) names.set(r.id, r.name)
  }
  return {
    community: { slug: community.slug, name: community.name, shortName: community.shortName },
    timezone: community.timezone,
    at: now,
    waiting,
    earlier,
    people,
    stopped: [...broke.map((w) => stoppedWatch(w, names, community.slug)), ...stoppedJobs(runs, since, community.slug)],
    google,
    appUrl: adminAppUrl(),
  }
}

export type NightlyEmailRun = { communities: { slug: string; sent: boolean; waiting: number; stopped: number; error?: string }[] }

/** Every community's email for last night; one failing doesn't stop the rest. */
export async function sendNightlyEmails(now: Date = new Date()): Promise<NightlyEmailRun> {
  const [communities, runs] = await Promise.all([listCommunities(), recentJobRuns()])
  const out: NightlyEmailRun['communities'] = []
  for (const c of communities) {
    try {
      const night = await gatherNight(c, now, runs)
      const email = buildNightlyEmail(night)
      if (email) await sendNightlyEmail(c.slug, email)
      out.push({ slug: c.slug, sent: !!email, waiting: night.waiting.length, stopped: night.stopped.length })
    } catch (err) {
      console.error(`[nightly-email] ${c.slug} failed:`, err)
      out.push({ slug: c.slug, sent: false, waiting: 0, stopped: 0, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return { communities: out }
}
