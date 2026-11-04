import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The run's own decisions: where it finds the list, what it dates, and when
// it reads nothing. Reading and matching the names is in kclWatch.test.ts.

const m = vi.hoisted(() => ({ rows: [] as unknown[], confirm: vi.fn(async (_c: string, ids: readonly string[]) => ids.length), text: '' }))
vi.mock('unpdf', () => ({ getDocumentProxy: async () => ({}), extractText: async () => ({ text: m.text }) }))
vi.mock('@/lib/sourceConfirm', () => ({ confirmFromSource: m.confirm }))
vi.mock('@/lib/supabase/admin', () => {
  const b: Record<string, unknown> = {}
  Object.assign(b, { select: () => b, eq: () => b, in: () => b, then: (r: (v: unknown) => void) => r({ data: m.rows, error: null }) })
  return { getAdminClient: () => ({ from: () => b }) }
})

const { runKclWatch } = await import('./kclRun')
const HOME = 'https://www.kclkashrus.org/'
const PDF = 'https://www.kclkashrus.org/wp-content/uploads/2025/06/KCL-Establishments-June-2025.pdf'
const names = (n: number) => Array.from({ length: n }, (_, i) => `Place ${i}`)

let asked: string[] = []
function serve(home = `<a href="/wp-content/uploads/2025/06/KCL-Establishments-June-2025.pdf">See Complete Listing</a>`) {
  asked = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    asked.push(url)
    return url === HOME ? new Response(home) : new Response(new Uint8Array([1]))
  }))
}

beforeEach(() => {
  m.confirm.mockClear()
  m.rows = [
    { id: 'gb', name: 'Gelbstein’s Bakery', status: 'approved', details: { kosherCert: ['OU', 'KCL'] } },
    { id: 'akc', name: 'Authentic Kosher Chinese', status: 'approved', details: { kosherCert: ['OU'] } },
  ]
  m.text = ['KCL- Certified Establishments', 'December 2025', 'Gelbstein’s Bakery', 'Authentic Kosher Chinese', ...names(150)].join('\n')
})
afterEach(() => vi.unstubAllGlobals())

describe('runKclWatch', () => {
  it('reads the PDF its home page links, and dates only the places that say KCL and are on it', async () => {
    serve()
    const run = await runKclWatch('philly', HOME)
    expect(asked).toEqual([HOME, PDF])
    expect(run).toMatchObject({ ok: true, entries: 152, matching: 1, findings: 0, filed: 0, listRead: { updated: 'December 2025' } })
    expect(m.confirm).toHaveBeenCalledWith('philly', ['gb'], 'KCL', ['kosher'])
  })

  it('a home page with no list on it, or a list too short to be the list, dates nothing', async () => {
    serve('<a href="/about">About</a>')
    expect(await runKclWatch('philly', HOME)).toMatchObject({ ok: false, error: expect.stringContaining('no longer links') })
    serve()
    m.text = 'KCL- Certified Establishments\nGelbstein’s Bakery'
    expect(await runKclWatch('philly', HOME)).toMatchObject({ ok: false, error: expect.stringContaining('Read only 1 names') })
    expect(m.confirm).not.toHaveBeenCalled()
  })
})
