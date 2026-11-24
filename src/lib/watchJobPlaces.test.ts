import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FINDING_SOURCES } from './watchFindings'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', async (actual) => ({ ...(await actual<object>()), cacheTag: () => {}, cacheLife: () => {} }))

// The Watches tab loads every job at once (api/admin/watches/jobs). Each
// job used to read the community's categories and only then its own
// places: eight reads of the same table, each a slice, a round trip after
// the categories. On the live site that was ~0.35s at p75 per wave, and
// the jobs read took 2.2s (Sentry, Nov 24). Now each job filters the one
// read Places makes (listResourcesForAdmin), started beside the categories,
// so inside shareReads it is made once and waits on nothing.
//
// The database is the committed seed, served by table and community.

const seed = (table: string) => JSON.parse(readFileSync(join(process.cwd(), 'supabase/seed/tables', `${table}.json`), 'utf8')) as Record<string, unknown>[]
const COMMUNITY = 'philly'

type Sent = { table: string; url: string; at: number }
const sent: Sent[] = []
/** Rows a test adds to a table, beside the seed's. */
const extra: Record<string, Record<string, unknown>[]> = {}
const ADMIN = { id: 'admin', aud: 'authenticated', email: 'person1@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' }

/** PostgREST's simple filters (`col=eq.v`, `col=in.(a,b)`), as the
 *  database would apply them. */
function filtered(rows: Record<string, unknown>[], params: URLSearchParams): Record<string, unknown>[] {
  let out = rows
  for (const [col, cond] of params) {
    if (['select', 'order', 'offset', 'limit', 'or'].includes(col)) continue
    const field = (r: Record<string, unknown>) => {
      const [base, sub] = col.split('->>')
      const v = r[base]
      return sub ? (v as Record<string, unknown> | null)?.[sub] : v
    }
    if (cond.startsWith('eq.')) out = out.filter((r) => String(field(r)) === cond.slice(3))
    else if (cond.startsWith('neq.')) out = out.filter((r) => String(field(r)) !== cond.slice(4))
    else if (cond.startsWith('in.(')) {
      const set = new Set(cond.slice(4, -1).split(',').map((v) => v.replace(/^"|"$/g, '')))
      out = out.filter((r) => set.has(String(field(r))))
    }
  }
  return out
}
let releaseCategories: () => void = () => {}
let categoriesAnswered = false

function stubDatabase() {
  sent.length = 0
  categoriesAnswered = false
  const categoriesHeld = new Promise<void>((r) => (releaseCategories = r))
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    if (url.pathname === '/auth/v1/user') return Response.json(ADMIN)
    const table = url.pathname.replace(/^\/rest\/v1\//, '')
    sent.push({ table, url: url.href, at: sent.length })
    if (table === 'category') {
      await categoriesHeld
      categoriesAnswered = true
    }
    const rows = filtered(
      [
        ...(() => {
          try {
            return seed(table)
          } catch {
            return []
          }
        })(),
        ...(extra[table] ?? []),
      ],
      url.searchParams,
    )
    const one = new Headers(init?.headers).get('accept')?.includes('vnd.pgrst.object')
    return new Response(JSON.stringify(one ? (rows[0] ?? null) : rows), { headers: { 'content-type': 'application/json' } })
  })
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.test')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
  stubDatabase()
})
afterEach(() => {
  for (const k of Object.keys(extra)) delete extra[k]
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const loaders = async () => {
  const [{ hoursJobPlaces, sitePlaces }, { linkStandings }, { loadGoogleJob }, { loadLookAgain }, { listUnreadMenus }] = await Promise.all([
    import('./hoursJobRun'),
    import('./linkCheckRun'),
    import('./googleJobRun'),
    import('./lookAgainRun'),
    import('./menuPlaceRead'),
  ])
  return {
    hours: () => hoursJobPlaces(COMMUNITY, 'hours'),
    times: () => hoursJobPlaces(COMMUNITY, 'times'),
    sites: () => sitePlaces(COMMUNITY),
    links: () => linkStandings(COMMUNITY),
    google: () => loadGoogleJob(COMMUNITY),
    lookAgain: () => loadLookAgain(COMMUNITY),
    menus: () => listUnreadMenus(COMMUNITY),
  }
}

const placeReads = () => sent.filter((s) => s.table === 'resource')

describe('a Watches load reads the community’s places', () => {
  it('without waiting for its categories, in every job', async () => {
    for (const [job, load] of Object.entries(await loaders())) {
      stubDatabase()
      const done = load()
      await vi.waitFor(() => expect(placeReads().length, `${job}: no places read while the categories are out`).toBeGreaterThan(0), { timeout: 500 })
      expect(categoriesAnswered, job).toBe(false)
      releaseCategories()
      await done
    }
  })

  it('once, for every job together', async () => {
    const { shareReads } = await import('./supabase/sharedReads')
    const all = await loaders()
    releaseCategories()
    await shareReads(() => Promise.all(Object.values(all).map((load) => load())))
    expect(placeReads().map((s) => decodeURIComponent(s.url))).toHaveLength(1)
  })

  it('and each job still gets only its own places', async () => {
    releaseCategories()
    const { hoursJobPlaces } = await import('./hoursJobRun')
    const { places, categories } = await hoursJobPlaces(COMMUNITY, 'times')
    const ids = new Set(categories.map((c) => c.id))
    expect(places.length).toBeGreaterThan(0)
    expect(places.every((p) => ids.has(p.category))).toBe(true)
    const archived = new Set(seed('resource').filter((r) => r.status !== 'approved').map((r) => r.id))
    expect(places.some((p) => archived.has(p.id))).toBe(false)
  })
})

// What each job's screen shows waiting: the findings its watches filed.
// They waited for the job's places (and so its categories), and then read
// the places they name once more: two round trips after everything else.
describe('a Watches screen’s findings', () => {
  const finding = (target: string) => ({
    id: 'f1', community_id: COMMUNITY, status: 'pending', operation: 'update', target_type: 'listing', target_id: target,
    submitted_by: { name: FINDING_SOURCES.times[0] }, payload: { name: 'x', category: 'synagogue', details: {} }, created_at: '2026-11-24T00:00:00Z',
  })
  const screens = async () => {
    const [{ GET: hours }, { GET: sites }] = await Promise.all([import('@/app/api/admin/watches/hours/route'), import('@/app/api/admin/watches/sites/route')])
    const ask = (handler: (r: Request) => Promise<Response>, path: string) => () => {
      const url = new URL(path, 'http://site.test')
      url.searchParams.set('community', COMMUNITY)
      return handler(new Request(url, { headers: { authorization: 'Bearer t' } }))
    }
    return { hours: ask(hours, '/api/admin/watches/hours'), times: ask(hours, '/api/admin/watches/hours?job=times'), sites: ask(sites, '/api/admin/watches/sites') }
  }

  it('are read while the categories are still out', async () => {
    for (const [screen, load] of Object.entries(await screens())) {
      stubDatabase()
      const done = load()
      await vi.waitFor(() => expect(sent.some((s) => s.table === 'submission'), `${screen}: no findings read while the categories are out`).toBe(true), { timeout: 500 })
      expect(categoriesAnswered, screen).toBe(false)
      releaseCategories()
      expect((await done).status, screen).toBe(200)
    }
  })

  it('take the places they name from the screen’s own read', async () => {
    const shul = seed('resource').find((r) => r.community_id === COMMUNITY && r.status === 'approved' && r.category === 'synagogue')!
    extra.submission = [finding(String(shul.id))]
    releaseCategories()
    const { times } = await screens()
    const res = await times()
    expect(res.status).toBe(200)
    const { places } = (await res.json()) as { places: { findings: unknown[] }[] }
    expect(places.flatMap((p) => p.findings)).toHaveLength(1)
    expect(placeReads()).toHaveLength(1)
  })
})

// A menu read that never finished (its function stopped) says so once it's
// older than any read can run. Main dishes' list read every reading as
// "being read" for ever (the list's `.map(fromRow)` gave it the index as the
// time), so three stuck since Nov 4 kept every admin screen asking for the
// list every 6s: about 5,700 requests in two weeks (Sentry, Nov 24).
describe('Main dishes', () => {
  it('says a menu read that never finished stopped, not that it is being read', async () => {
    const places = seed('resource').filter((r) => r.community_id === COMMUNITY && r.status === 'approved' && r.category === 'restaurant').slice(0, 2)
    expect(places).toHaveLength(2)
    const row = (id: unknown, readAt: string) => ({ community_id: COMMUNITY, resource_id: id, status: 'failed', source_url: 'https://menu.test', dishes: [], note: 'Reading its menu now', model: null, read_at: readAt, decided_at: null, decided_by: null })
    extra.menu_reading = [row(places[0].id, '2026-11-04T00:19:52.111+00:00'), row(places[1].id, new Date().toISOString())]
    releaseCategories()
    const { GET } = await import('@/app/api/admin/main-dishes/route')
    const res = await GET(new Request(`http://site.test/api/admin/main-dishes?community=${COMMUNITY}`, { headers: { authorization: 'Bearer t' } }))
    expect(res.status).toBe(200)
    const status = new Map(((await res.json()) as { places: { id: string; reading: { status: string } | null }[] }).places.map((p) => [p.id, p.reading?.status]))
    expect(status.get(String(places[0].id))).toBe('failed')
    // One started just now is still being read.
    expect(status.get(String(places[1].id))).toBe('reading')
  })
})
