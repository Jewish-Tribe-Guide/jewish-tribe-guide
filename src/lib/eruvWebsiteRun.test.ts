import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ERUV_WEBSITE_CREATOR, ERUV_WEBSITE_WATCH_NAME } from './eruvWebsite'

const m = vi.hoisted(() => ({
  eruvim: [] as unknown[],
  watches: [] as unknown[],
  earlier: [] as unknown[],
  updates: [] as { payload: unknown; id: unknown }[],
  submitEruvUpdate: vi.fn(),
  sendWatchDigest: vi.fn(),
  addWatch: vi.fn(),
  removeWatch: vi.fn(),
}))
vi.mock('@/lib/eruvStore', () => ({ listEruvimForAdmin: async () => ({ available: true, eruvim: m.eruvim }) }))
vi.mock('@/lib/watchStore', () => ({ listWatches: async () => ({ available: true, watches: m.watches }), addWatch: m.addWatch, removeWatch: m.removeWatch }))
vi.mock('@/lib/submissionStore', () => ({ submitEruvUpdate: m.submitEruvUpdate }))
vi.mock('@/lib/email', () => ({ sendWatchDigest: m.sendWatchDigest }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      let payload: unknown
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => {
          if (col === 'id' && payload) m.updates.push({ payload, id: v })
          return q
        },
        update: (row: { payload: unknown }) => {
          payload = row.payload
          return q
        },
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: table === 'community' ? [{ slug: 'philly' }] : m.earlier, error: null }).then(ok),
      }
      return q
    },
  }),
}))

const { runEruvWebsiteWatch, syncEruvWebsiteWatches } = await import('./eruvWebsiteRun')

const URL_ = 'https://lowermerioneruv.org/'
const LOWER_MERION = { id: 'lower-merion', name: 'Lower Merion Eruv', covers: 'Bala Cynwyd', website: 'lowermerioneruv.org', hotline: '(610) 664-5626, option 3', alertsUrl: null }
const words = 'The Lower Merion eruv is checked every week by our volunteers. '.repeat(5)
const site = (body: string) => (async () => new Response(`<html><body><p>${words}</p>${body}</body></html>`, { status: 200 })) as unknown as typeof fetch
const NEW_NUMBER = site('Eruv hotline: (610) 555-0199')

beforeEach(() => {
  m.eruvim = [LOWER_MERION]
  m.watches = []
  m.earlier = []
  m.updates = []
  vi.clearAllMocks()
  m.submitEruvUpdate.mockResolvedValue({})
  m.sendWatchDigest.mockResolvedValue(undefined)
  m.addWatch.mockResolvedValue({})
})

describe('reading an eruv’s website', () => {
  it('files what differs as its suggestion, and says so on Eruv status', async () => {
    const out = await runEruvWebsiteWatch('philly', URL_, NEW_NUMBER)
    expect(out).toMatchObject({ ok: true, filed: 1, check: { what: 'details', result: 'differs', queue: 'filed', differences: ['Lower Merion Eruv: Hotline (610) 664-5626, option 3 → (610) 555-0199'] } })
    expect(m.submitEruvUpdate).toHaveBeenCalledWith(
      'philly',
      { eruvId: 'lower-merion', name: 'Lower Merion Eruv', covers: 'Bala Cynwyd', website: 'lowermerioneruv.org', hotline: '(610) 555-0199', alertsUrl: null },
      'Read from its website, https://lowermerioneruv.org/',
      { name: ERUV_WEBSITE_WATCH_NAME },
    )
    expect(m.sendWatchDigest).toHaveBeenCalledWith('philly', 'Eruv websites', [{ name: 'Lower Merion Eruv', what: 'Hotline' }], { path: '/philly/admin/watches/eruv', name: 'Eruv status' })
  })

  it('agrees, and files nothing, when the page has its number', async () => {
    const out = await runEruvWebsiteWatch('philly', URL_, site('Call (610) 664-5626'))
    expect(out).toMatchObject({ ok: true, filed: 0, check: { result: 'agrees', read: ['Hotline: (610) 664-5626, option 3'], queue: null } })
    expect(m.submitEruvUpdate).not.toHaveBeenCalled()
  })

  it('never files the same reading twice: waiting, or decided before', async () => {
    const filed = { eruvId: 'lower-merion', hotline: '(610) 555-0199', alertsUrl: null }
    m.earlier = [{ id: 's1', status: 'pending', payload: filed }]
    expect(await runEruvWebsiteWatch('philly', URL_, NEW_NUMBER)).toMatchObject({ filed: 0, check: { queue: 'waiting' } })
    m.earlier = [{ id: 's1', status: 'rejected', payload: filed }]
    expect(await runEruvWebsiteWatch('philly', URL_, NEW_NUMBER)).toMatchObject({ filed: 0, check: { queue: 'before' } })
    expect(m.submitEruvUpdate).not.toHaveBeenCalled()
  })

  it('a newer reading takes the place of one still waiting', async () => {
    m.earlier = [{ id: 's1', status: 'pending', payload: { eruvId: 'lower-merion', hotline: '(610) 555-0100', alertsUrl: null } }]
    expect(await runEruvWebsiteWatch('philly', URL_, NEW_NUMBER)).toMatchObject({ filed: 1, check: { queue: 'filed' } })
    expect(m.updates).toEqual([{ id: 's1', payload: expect.objectContaining({ hotline: '(610) 555-0199' }) }])
    expect(m.submitEruvUpdate).not.toHaveBeenCalled()
  })

  it('fails, saying why, when no eruv has the website or the page is empty', async () => {
    expect(await runEruvWebsiteWatch('philly', 'https://elsewhere.org/', NEW_NUMBER)).toEqual({ ok: false, error: 'No eruv in the guide has this website any more' })
    const empty = (async () => new Response('<html></html>')) as unknown as typeof fetch
    expect(await runEruvWebsiteWatch('philly', URL_, empty)).toMatchObject({ ok: false, error: expect.stringContaining('nearly empty') })
  })
})

it('gives each eruv’s website its watch, and takes away one no eruv has', async () => {
  m.watches = [{ id: 'w-gone', url: 'https://gone.org/', createdBy: ERUV_WEBSITE_CREATOR }]
  expect(await syncEruvWebsiteWatches()).toEqual([{ community: 'philly', added: 1, removed: 1 }])
  expect(m.addWatch).toHaveBeenCalledWith('philly', { kind: 'website', url: URL_, resourceId: null, label: 'Lower Merion Eruv’s website', createdBy: ERUV_WEBSITE_CREATOR })
  expect(m.removeWatch).toHaveBeenCalledWith('philly', 'w-gone')
})
