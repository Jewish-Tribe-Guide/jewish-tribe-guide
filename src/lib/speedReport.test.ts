import { afterEach, describe, expect, it, vi } from 'vitest'
import { SPEED_QUERIES, SPEED_TARGETS, buildSpeedEmail, isSpeedReportDay, readWeekSpeed, readWeekSpeedFromSentry, speedRows, speedSubject, type WeekSpeed } from './speedReport'

const WEEK: WeekSpeed = { lcp: 2_266, inp: 150, cls: 0.19, adminRead: 532, adminSave: 990, slowAdmin: [] }

describe('the week against the targets', () => {
  it('marks each target met or over, and says when there was nothing to measure', () => {
    const rows = speedRows({ ...WEEK, inp: null })
    expect(rows.map((r) => [r.key, r.week, r.met])).toEqual([
      ['lcp', '2.3s', true],
      ['inp', 'no data', null],
      ['cls', '0.19', false],
      ['adminRead', '532ms', true],
      ['adminSave', '990ms', true],
    ])
    expect(rows.map((r) => r.target)).toEqual(['≤ 2.5s', '≤ 200ms', '≤ 0.10', '≤ 1.0s', '≤ 1.0s'])
  })

  it('the target itself is met, a hair over is not', () => {
    expect(speedRows({ ...WEEK, lcp: SPEED_TARGETS.lcp })[0].met).toBe(true)
    expect(speedRows({ ...WEEK, lcp: SPEED_TARGETS.lcp + 1 })[0].met).toBe(false)
  })

  it('the subject says how many were missed', () => {
    expect(speedSubject(speedRows(WEEK))).toBe('Speed this week: 1 of 5 targets missed')
    expect(speedSubject(speedRows({ ...WEEK, cls: 0.02 }))).toBe('Speed this week: every target met')
    expect(speedSubject(speedRows({ lcp: null, inp: null, cls: null, adminRead: null, adminSave: null, slowAdmin: [] }))).toBe('Speed this week: no measurements')
  })
})

describe('reading Sentry', () => {
  const answers = (by: (query: string) => Record<string, unknown>[]) => async (p: URLSearchParams) => ({ data: by(p.get('query')!) })

  it('asks the spans dataset for the last 7 days, and reads each answer into its target', async () => {
    const asked: URLSearchParams[] = []
    const week = await readWeekSpeed(async (p) => {
      asked.push(p)
      return answers((q) => {
        if (q === SPEED_QUERIES.pageload.query) return [{ 'p75(measurements.lcp)': 2266, 'p75(measurements.cls)': 0.19 }]
        if (q === SPEED_QUERIES.interaction.query) return [{ 'p75(measurements.inp)': 150 }]
        if (q === SPEED_QUERIES.adminRead.query) return [{ 'p75(span.duration)': 532 }]
        if (q === SPEED_QUERIES.adminSave.query) return [{ 'p75(span.duration)': null }]
        return [
          { transaction: 'GET /api/admin/watches/jobs', 'p75(span.duration)': 2185, 'count()': 120 },
          { transaction: 'PATCH /api/admin/submissions/[id]', 'p75(span.duration)': 1200, 'count()': 40 },
          { transaction: 'GET /api/admin/whoami', 'p75(span.duration)': 439, 'count()': 120 },
        ]
      })(p)
    })
    expect(asked.every((p) => p.get('dataset') === 'spans' && p.get('statsPeriod') === '7d')).toBe(true)
    expect(week).toEqual({
      lcp: 2266,
      cls: 0.19,
      inp: 150,
      adminRead: 532,
      adminSave: null,
      slowAdmin: [
        { route: 'GET /api/admin/watches/jobs', p75: 2185, count: 120 },
        { route: 'PATCH /api/admin/submissions/[id]', p75: 1200, count: 40 },
      ],
    })
  })

  it('a save and a read are told apart by the method', () => {
    expect(SPEED_QUERIES.adminRead.query).toContain('transaction:"GET *"')
    expect(SPEED_QUERIES.adminSave.query).toContain('!transaction:"GET *"')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('without a token, says so rather than going quiet', async () => {
    vi.stubEnv('SENTRY_API_TOKEN', '')
    const r = await readWeekSpeedFromSentry(async () => new Response('{}'))
    expect(r).toEqual({ error: expect.stringContaining('SENTRY_API_TOKEN') })
    expect(buildSpeedEmail(r).subject).toBe('Speed this week: couldn’t read Sentry')
  })

  it('a refused read is an error, not a week of no data', async () => {
    vi.stubEnv('SENTRY_ORG', 'org')
    vi.stubEnv('SENTRY_API_TOKEN', 'token')
    expect(await readWeekSpeedFromSentry(async () => new Response('no', { status: 403 }))).toEqual({ error: 'Sentry answered 403' })
  })
})

describe('the email', () => {
  it('lists each target and the slowest admin requests', () => {
    const { html } = buildSpeedEmail({ ...WEEK, slowAdmin: [{ route: 'GET /api/admin/watches/jobs', p75: 2185, count: 120 }] })
    expect(html).toContain('Visitors: page jumping (CLS)')
    expect(html).toContain('0.19 · over')
    expect(html).toContain('GET /api/admin/watches/jobs: 2.2s')
  })
})

it('goes on Sundays in the site’s time', () => {
  expect(isSpeedReportDay(new Date('2026-11-29T15:00:00Z'))).toBe(true)
  expect(isSpeedReportDay(new Date('2026-11-30T03:00:00Z'))).toBe(true) // still Sunday evening in Philadelphia
  expect(isSpeedReportDay(new Date('2026-11-28T15:00:00Z'))).toBe(false)
})
