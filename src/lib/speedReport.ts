// ─────────────────────────────────────────────────────────────────────────────
// The week's speed, against docs/speed-targets.md (Nov 24).
//
// The targets were written down (Nov 16), but nothing told anyone when the
// live site missed them: Speed Insights is read by hand, and CI checks
// counts and order, never time. Sentry already measures both halves on real
// use: visitors' web vitals (the browser's pageload and interaction spans)
// and every admin request's duration (the server's transactions), sampled
// at 10%. So once a week the site owners get one email: each target, this
// week's p75, and whether it's met. A report, not an alert: a slow week is
// something to look into, and the email says where.
//
// Vercel's Speed Insights has no read API (only its dashboard and the CLI),
// which is why this reads Sentry. Needs SENTRY_ORG and SENTRY_API_TOKEN
// (read-only) where the cron runs; without them the email says it couldn't
// read rather than going quiet.
// ─────────────────────────────────────────────────────────────────────────────

/** docs/speed-targets.md. Milliseconds, except CLS. */
export const SPEED_TARGETS = {
  lcp: 2_500,
  inp: 200,
  cls: 0.1,
  adminRead: 1_000,
  adminSave: 1_000,
} as const

export type SpeedKey = keyof typeof SPEED_TARGETS

export type RouteTime = { route: string; p75: number; count: number }

export type WeekSpeed = {
  lcp: number | null
  inp: number | null
  cls: number | null
  adminRead: number | null
  adminSave: number | null
  /** Admin routes over their target this week, slowest first. */
  slowAdmin: RouteTime[]
}

const LABELS: Record<SpeedKey, string> = {
  lcp: 'Visitors: page shown (LCP)',
  inp: 'Visitors: answer to a tap (INP)',
  cls: 'Visitors: page jumping (CLS)',
  adminRead: 'Admin: a screen’s data loading',
  adminSave: 'Admin: a save',
}

const ADMIN = 'is_transaction:true transaction:"* /api/admin/*"'

/** The Sentry queries, by what they measure (spans dataset, last 7 days). */
export const SPEED_QUERIES = {
  pageload: { fields: ['p75(measurements.lcp)', 'p75(measurements.cls)'], query: 'is_transaction:true span.op:pageload' },
  interaction: { fields: ['p75(measurements.inp)'], query: 'span.op:ui.interaction.*' },
  adminRead: { fields: ['p75(span.duration)'], query: `${ADMIN} transaction:"GET *"` },
  adminSave: { fields: ['p75(span.duration)'], query: `${ADMIN} !transaction:"GET *"` },
  adminRoutes: { fields: ['transaction', 'p75(span.duration)', 'count()'], query: ADMIN },
} as const

type Get = (params: URLSearchParams) => Promise<{ data?: Record<string, unknown>[] }>

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** This week's numbers. `get` is one Sentry events query. */
export async function readWeekSpeed(get: Get): Promise<WeekSpeed> {
  const ask = (q: { fields: readonly string[]; query: string }, extra: [string, string][] = []) =>
    get(new URLSearchParams([...q.fields.map((f) => ['field', f] as [string, string]), ['query', q.query], ['dataset', 'spans'], ['statsPeriod', '7d'], ...extra]))
  const [page, tap, read, save, routes] = await Promise.all([
    ask(SPEED_QUERIES.pageload),
    ask(SPEED_QUERIES.interaction),
    ask(SPEED_QUERIES.adminRead),
    ask(SPEED_QUERIES.adminSave),
    ask(SPEED_QUERIES.adminRoutes, [['sort', '-p75(span.duration)'], ['per_page', '50']]),
  ])
  const one = (r: { data?: Record<string, unknown>[] }, f: string) => num(r.data?.[0]?.[f])
  return {
    lcp: one(page, 'p75(measurements.lcp)'),
    cls: one(page, 'p75(measurements.cls)'),
    inp: one(tap, 'p75(measurements.inp)'),
    adminRead: one(read, 'p75(span.duration)'),
    adminSave: one(save, 'p75(span.duration)'),
    slowAdmin: (routes.data ?? [])
      .map((r) => ({ route: String(r.transaction ?? ''), p75: num(r['p75(span.duration)']) ?? 0, count: num(r['count()']) ?? 0 }))
      .filter((r) => r.route && r.p75 > SPEED_TARGETS[r.route.startsWith('GET ') ? 'adminRead' : 'adminSave'])
      .sort((a, b) => b.p75 - a.p75),
  }
}

export type SpeedRow = { key: SpeedKey; label: string; target: string; week: string; met: boolean | null }

function shown(key: SpeedKey, v: number): string {
  if (key === 'cls') return v.toFixed(2)
  return v < 1_000 ? `${Math.round(v)}ms` : `${(v / 1_000).toFixed(1)}s`
}

/** One row a target: its p75 this week and whether it's met (null: no data). */
export function speedRows(s: WeekSpeed): SpeedRow[] {
  return (Object.keys(SPEED_TARGETS) as SpeedKey[]).map((key) => {
    const v = s[key]
    const target = SPEED_TARGETS[key]
    return { key, label: LABELS[key], target: `≤ ${shown(key, target)}`, week: v == null ? 'no data' : shown(key, v), met: v == null ? null : v <= target }
  })
}

export function speedSubject(rows: readonly SpeedRow[]): string {
  const missed = rows.filter((r) => r.met === false).length
  if (missed) return `Speed this week: ${missed} of ${rows.length} targets missed`
  if (rows.every((r) => r.met == null)) return 'Speed this week: no measurements'
  return 'Speed this week: every target met'
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function buildSpeedEmail(s: WeekSpeed | { error: string }): { subject: string; html: string } {
  if ('error' in s) {
    return {
      subject: 'Speed this week: couldn’t read Sentry',
      html: `<p style="font-family:system-ui,sans-serif;font-size:15px;color:#0f172a;">This week’s speed couldn’t be read from Sentry: ${esc(s.error)}</p>`,
    }
  }
  const rows = speedRows(s)
  const cell = 'padding:8px 10px;border-bottom:1px solid #e2e8f0;'
  const body = rows
    .map(
      (r) => `<tr>
      <td style="${cell}color:#0f172a;">${esc(r.label)}</td>
      <td style="${cell}color:#475569;">${esc(r.target)}</td>
      <td style="${cell}font-weight:700;color:${r.met === false ? '#b91c1c' : '#0f172a'};">${esc(r.week)}${r.met === false ? ' · over' : ''}</td>
    </tr>`,
    )
    .join('')
  const slow = s.slowAdmin.slice(0, 5)
  return {
    subject: speedSubject(rows),
    html: `<div style="font-family:system-ui,sans-serif;max-width:560px;">
  <p style="font-size:15px;color:#0f172a;margin:0 0 10px;">The last 7 days on the live site, at p75 (three in four were faster), against docs/speed-targets.md.</p>
  <table style="border-collapse:collapse;font-size:14px;width:100%;">${body}</table>
  ${slow.length ? `<p style="font-size:14px;color:#0f172a;margin:14px 0 4px;font-weight:700;">Slowest admin requests</p><ul style="margin:0;padding-left:18px;font-size:14px;color:#334155;">${slow.map((r) => `<li>${esc(r.route)}: ${esc(shown('adminRead', r.p75))}</li>`).join('')}</ul>` : ''}
</div>`,
  }
}

/** Sundays, in the site's time. The nightly email's cron runs once a day. */
export function isSpeedReportDay(now: Date, timezone = 'America/New_York'): boolean {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: timezone }).format(now) === 'Sun'
}

/** Reads Sentry with the read-only token, or says why it can't. */
export async function readWeekSpeedFromSentry(fetchImpl: typeof fetch = fetch): Promise<WeekSpeed | { error: string }> {
  const org = process.env.SENTRY_ORG
  const token = process.env.SENTRY_API_TOKEN
  if (!org || !token) return { error: 'SENTRY_ORG or SENTRY_API_TOKEN isn’t set where the nightly email runs.' }
  try {
    return await readWeekSpeed(async (params) => {
      const res = await fetchImpl(`https://sentry.io/api/0/organizations/${encodeURIComponent(org)}/events/?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`Sentry answered ${res.status}`)
      return (await res.json()) as { data?: Record<string, unknown>[] }
    })
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
