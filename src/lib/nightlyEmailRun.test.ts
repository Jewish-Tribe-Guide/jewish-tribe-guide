import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Watch } from './watches'
import type { JobRun } from './jobRuns'
import { LISTING_PAGE_WATCH_NAME } from './listingPageWatch'
import { KEYSTONE_WATCH_NAME } from './keystoneWatch'

// The nightly email's run: the night gathered from the queue, the watches
// and the jobs, then one email a community (nightlyEmail.ts builds it).

const m = vi.hoisted(() => ({
  pending: [] as Record<string, unknown>[],
  resources: [] as Record<string, unknown>[],
  watches: [] as Partial<Watch>[],
  runs: new Map<string, JobRun[]>(),
  google: [] as unknown[],
  sent: [] as { slug: string; subject: string; html: string }[],
}))

vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      const rows = () => (table === 'submission' ? m.pending : m.resources)
      const c: Record<string, unknown> = {
        select: () => c,
        eq: () => c,
        in: () => c,
        order: () => c,
        then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok),
      }
      return c
    },
  }),
}))
vi.mock('./communityStore', () => ({
  listCommunities: async () => [{ slug: 'philly', name: 'Philly Jewish Guide', shortName: 'Philly', timezone: 'America/New_York' }],
}))
vi.mock('./categoryStore', () => ({
  listCategoriesUncached: async () => [{ id: 'shul', label: 'Shul', pluralLabel: 'Synagogues', detailFields: [{ key: 'hechsher', label: 'Hechsher', type: 'text' }] }],
}))
vi.mock('./watchStore', () => ({ listWatches: async () => ({ watches: m.watches, available: true }) }))
vi.mock('./jobRunStore', () => ({ recentJobRuns: async () => m.runs }))
vi.mock('./nightNoteStore', () => ({ statusChangesSince: async () => m.google }))
vi.mock('./email', () => ({
  adminAppUrl: () => 'https://guide.example',
  sendNightlyEmail: async (slug: string, e: { subject: string; html: string }) => void m.sent.push({ slug, ...e }),
}))

const { sendNightlyEmails, stoppedJobs, stoppedWatch, watchWhy, isAutomated } = await import('./nightlyEmailRun')

const NOW = new Date('2026-11-13T09:45:00Z')
const TONIGHT = '2026-11-13T07:05:00Z'
const LAST_WEEK = '2026-11-05T07:05:00Z'

const suggestion = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  community_id: 'philly',
  operation: 'update',
  target_type: 'listing',
  target_id: 'r1',
  payload: { category: 'shul', name: 'Sababa', details: { hechsher: 'OK' } },
  note: null,
  status: 'pending',
  submitted_by: { name: KEYSTONE_WATCH_NAME },
  created_at: TONIGHT,
  reviewed_at: null,
  ...over,
})

const watch = (over: Partial<Watch> = {}): Watch =>
  ({ id: 'w1', communityId: 'philly', kind: 'website', url: 'https://www.shtiebel.org/times', resourceId: 'r2', label: null, active: true, createdBy: null, lastError: 'The page answered 503', failingSince: TONIGHT, ...over }) as Watch

const run = (over: Partial<JobRun>): JobRun => ({ id: 'j', job: 'watches', startedAt: TONIGHT, finishedAt: TONIGHT, ok: true, summary: 'Checked 107', warning: null, error: null, ...over })

beforeEach(() => {
  m.pending = []
  m.resources = [{ id: 'r1', name: 'Sababa', category: 'shul', details: { hechsher: 'Keystone-K' } }, { id: 'r2', name: 'South Philadelphia Shtiebel', category: 'shul', details: {} }]
  m.watches = []
  m.runs = new Map()
  m.google = []
  m.sent = []
})

describe('what waits on To do', () => {
  it('tonight’s finds a row a place, linked to that place in To do', async () => {
    m.pending = [suggestion()]
    await sendNightlyEmails(NOW)
    expect(m.sent).toHaveLength(1)
    expect(m.sent[0].subject).toBe('Philly Jewish Guide · Nightly watches: 1 to check')
    expect(m.sent[0].html).toContain('Kosher certificate')
    expect(m.sent[0].html).toContain('From Keystone-K’s list')
    expect(m.sent[0].html).toContain('href="https://guide.example/philly/admin/watches/place/r1?from=todo"')
  })

  it('a find from an earlier night, and a person’s, only counted under the list', async () => {
    m.pending = [
      suggestion(),
      suggestion({ id: 's2', target_id: 'r2', created_at: LAST_WEEK }),
      suggestion({ id: 's3', submitted_by: { name: 'Dina' } }),
    ]
    await sendNightlyEmails(NOW)
    expect(m.sent[0].subject).toContain(': 1 to check')
    expect(m.sent[0].html).toContain('Also in To do: 1 from earlier nights and 1 from people')
  })

  it('no email when the night had nothing, however much is on To do', async () => {
    m.pending = [suggestion({ created_at: LAST_WEEK }), suggestion({ id: 's3', submitted_by: { name: 'Dina' } })]
    expect((await sendNightlyEmails(NOW)).communities).toEqual([{ slug: 'philly', sent: false, waiting: 0, stopped: 0 }])
    expect(m.sent).toEqual([])
  })
})

describe('what stopped working', () => {
  it('a watch that broke last night, linked to its place in Watches', async () => {
    m.watches = [watch(), watch({ id: 'old', failingSince: LAST_WEEK }), watch({ id: 'paused', active: false })]
    await sendNightlyEmails(NOW)
    expect(m.sent[0].subject).toBe('Philly Jewish Guide · Nightly watches: 1 stopped working')
    expect(m.sent[0].html).toContain('South Philadelphia Shtiebel’s website')
    expect(m.sent[0].html).toContain('href="https://guide.example/philly/admin/watches/place/r2"')
    expect(m.sent[0].html.match(/Stopped working · (\d)/)?.[1]).toBe('1')
  })

  it('a watch by what it is', () => {
    const names = new Map([['r2', 'Kesher Israel']])
    expect(stoppedWatch(watch(), names, 'philly')).toMatchObject({ name: 'Kesher Israel’s website', kind: 'website' })
    expect(stoppedWatch(watch({ kind: 'keystone_list', resourceId: null, label: null }), names, 'philly')).toMatchObject({ name: 'Keystone-K’s list', kind: 'list', path: '/philly/admin/watches' })
    expect(stoppedWatch(watch({ resourceId: null }), names, 'philly').name).toBe('shtiebel.org')
  })

  it('why, in a few words', () => {
    expect(watchWhy('The page answered 503')).toBe('The page couldn’t be opened')
    expect(watchWhy('fetch failed')).toBe('The page couldn’t be opened')
    expect(watchWhy('The reader gave back nothing')).toBe('Its page couldn’t be read')
  })

  it('a job whose run last night broke it; not one already broken before', () => {
    const since = new Date(NOW.getTime() - 24 * 3_600_000).toISOString()
    const runs = new Map<string, JobRun[]>([
      ['watches', [run({ ok: false, error: 'boom' }), run({ startedAt: LAST_WEEK })]],
      ['read-menus', [run({ job: 'read-menus', ok: false, error: 'still' }), run({ job: 'read-menus', startedAt: LAST_WEEK, ok: false, error: 'still' })]],
    ])
    expect(stoppedJobs(runs, since, 'philly')).toEqual([{ name: 'Watches (nightly job)', why: 'Boom', kind: 'job', path: '/philly/admin/watches' }])
  })

  it('this email’s own run broke last night: told of the night after', () => {
    const since = new Date(NOW.getTime() - 24 * 3_600_000).toISOString()
    const going = run({ job: 'nightly-email', startedAt: NOW.toISOString(), finishedAt: null, ok: null })
    const lastNight = run({ job: 'nightly-email', startedAt: '2026-11-12T09:45:00Z', ok: false, error: 'resend down' })
    const before = run({ job: 'nightly-email', startedAt: '2026-11-11T09:45:00Z' })
    expect(stoppedJobs(new Map([['nightly-email', [going, lastNight, before]]]), since, 'philly')).toEqual([
      expect.objectContaining({ name: 'Nightly email (nightly job)', why: 'Resend down' }),
    ])
  })
})

describe('Google, on its own', () => {
  it('a quiet night with a Google change still sends', async () => {
    m.google = [{ name: 'Hakol', category: 'restaurant', from: 'OPERATIONAL', to: 'CLOSED_TEMPORARILY', communitySlug: 'philly' }]
    await sendNightlyEmails(NOW)
    expect(m.sent[0].subject).toBe('Philly Jewish Guide · Nightly watches: nothing to check')
    expect(m.sent[0].html).toContain('Google: Hakol is now temporarily closed. Already on the site.')
  })
})

describe('what counts as a watch’s', () => {
  it('every automated name, and no person’s', () => {
    expect(isAutomated({ submitted_by: { name: LISTING_PAGE_WATCH_NAME } })).toBe(true)
    expect(isAutomated({ submitted_by: { name: 'Its website (automated, eruv)' } })).toBe(true)
    expect(isAutomated({ submitted_by: { name: 'Dina' } })).toBe(false)
    expect(isAutomated({ submitted_by: null } as never)).toBe(false)
  })
})
