import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  listing: null as Record<string, unknown> | null,
  earlier: [] as { id?: string; status?: string; payload: unknown }[],
  submitListingUpdate: vi.fn(),
  replacePendingSuggestion: vi.fn(),
  sendWatchDigest: vi.fn(),
  getCategoryById: vi.fn(),
  confirmFromSource: vi.fn(),
}))

// The two reads the run makes: the listing (maybeSingle), and what the watch
// filed for it before (awaited as a list).
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: m.listing, error: null }),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: table === 'submission' ? m.earlier : [], error: null }).then(ok),
      }
      return q
    },
  }),
}))
vi.mock('@/lib/submissionStore', () => ({ submitListingUpdate: m.submitListingUpdate, replacePendingSuggestion: m.replacePendingSuggestion }))
vi.mock('@/lib/email', () => ({ sendWatchDigest: m.sendWatchDigest }))
vi.mock('@/lib/categoryStore', () => ({ getCategoryById: m.getCategoryById }))
vi.mock('@/lib/sourceConfirm', () => ({ confirmFromSource: m.confirmFromSource }))

const { runRefuahWatch } = await import('./refuahRun')
const { REFUAH_WATCH_NAME } = await import('./refuahWatch')

const URL_ = 'https://refuah.com/hospitals/jx77h9d00qztqgbbe8e0rfj1r589mgf5'
const HOSPITAL = 'b5f6c7d8-0000-4000-8000-000000000001'
const record = (phone: string) => ({
  name: 'HUP',
  liaisons: [{ name: 'Bikur Cholim of Philadelphia', info: 'Mrs. Schwartz', phone1: phone }],
  services: [],
})

function refuahAnswers(value: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ status: 'success', value })))
}

beforeEach(() => {
  vi.restoreAllMocks()
  m.submitListingUpdate.mockReset().mockResolvedValue({ id: 's1' })
  m.replacePendingSuggestion.mockReset().mockResolvedValue(true)
  m.sendWatchDigest.mockReset().mockResolvedValue(undefined)
  m.confirmFromSource.mockReset().mockResolvedValue(1)
  m.getCategoryById.mockReset().mockResolvedValue({ detailFields: [{ key: 'liaisons', label: 'Liaisons', type: 'contacts' }] })
  m.earlier = []
  m.listing = {
    id: HOSPITAL,
    category: 'hospital',
    name: 'Hospital of the University of Pennsylvania',
    address: '3400 Spruce St',
    phone: null,
    anchor_id: 'community',
    distance: null,
    details: { liaisons: [{ name: 'Bikur Cholim of Philadelphia', who: 'Mrs. Schwartz', phones: ['+1 215-805-8668'] }], r: URL_ },
  }
})

describe('runRefuahWatch', () => {
  it('asks Refuah’s data service for the page’s hospital, and files nothing when the guide agrees', async () => {
    const fetchSpy = refuahAnswers(record('+1 215-805-8668'))
    const out = await runRefuahWatch('philly', URL_, HOSPITAL)
    expect(out).toMatchObject({ ok: true, filed: 0, check: { what: 'contacts', result: 'agrees', read: ['1 contact on Refuah'], differences: [], queue: null } })
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toMatchObject({ path: 'hospitals:getWithReferences', args: { id: 'jx77h9d00qztqgbbe8e0rfj1r589mgf5' } })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
    // …and dates the hospital by Refuah (Oct 19: agreement used to leave
    // the date where the last approval put it).
    expect(m.confirmFromSource).toHaveBeenCalledWith('philly', [HOSPITAL], 'Refuah')
  })

  it('files a difference as a suggestion from Refuah, named, so approval dates it “From Refuah”', async () => {
    refuahAnswers(record('+1 215-805-9000'))
    const out = await runRefuahWatch('philly', URL_, HOSPITAL)
    expect(out).toMatchObject({ ok: true, filed: 1, check: { result: 'differs', differences: [expect.stringContaining('+1 215-805-9000')], queue: 'filed' } })
    const [community, id, payload, note, by] = m.submitListingUpdate.mock.calls[0]
    expect([community, id, by]).toEqual(['philly', HOSPITAL, { name: REFUAH_WATCH_NAME }])
    expect(payload.details.liaisons).toEqual([{ name: 'Bikur Cholim of Philadelphia', who: 'Mrs. Schwartz', phones: ['+1 215-805-9000'] }])
    expect(payload.details.r).toBe(URL_)
    expect(payload.source).toMatchObject({ readBy: 'automatic', from: 'Refuah', named: 'Refuah' })
    expect(note).toContain('phone +1 215-805-8668 → +1 215-805-9000')
    expect(m.sendWatchDigest).toHaveBeenCalledWith('philly', 'Refuah', [expect.objectContaining({ name: 'Hospital of the University of Pennsylvania' })], { path: '/philly/admin/watches/hospitals', name: 'Hospitals' })
  })

  it('doesn’t file the same suggestion twice, whatever became of the first', async () => {
    refuahAnswers(record('+1 215-805-9000'))
    m.earlier = [{ payload: { details: { liaisons: [{ name: 'Bikur Cholim of Philadelphia', who: 'Mrs. Schwartz', phones: ['+1 215-805-9000'] }] } } }]
    expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: true, filed: 0, check: { result: 'differs', queue: 'before' } })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  // Penn Presbyterian and Pennsylvania Hospital, Oct 17: on Refuah with
  // nothing under them. A good read, not a broken watch emailing every day.
  it('a hospital Refuah has nothing for is a good read with nothing to file', async () => {
    refuahAnswers({ name: 'Penn Presbyterian Medical Center', liaisons: [], services: [] })
    expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: true, filed: 0, check: { result: 'nothing', read: [] } })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
    // Agreeing only by having nothing doesn't date it.
    expect(m.confirmFromSource).not.toHaveBeenCalled()
  })

  it('a record in a shape it doesn’t know, or an error, is a failed run, never a card', async () => {
    refuahAnswers({ liaisons: 'none' })
    expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: false })
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'error', errorMessage: 'Could not find function' })))
    expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: false, error: expect.stringContaining('Could not find function') })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  describe('a box of the listing at a time (Oct 22)', () => {
    const CATEGORY = {
      detailFields: [
        { key: 'liaisons', label: 'Liaisons', type: 'contacts' },
        { key: 'transportation', label: 'Transportation', type: 'contacts', entryFrom: true },
      ],
      listingParts: { boxes: [{ title: 'Who to call', fields: ['liaisons'] }, { title: 'Rides', fields: ['transportation'] }] },
    }
    const RIDES = [
      { from: 'Monsey', name: 'Darchei Chesed', phones: ['+1 845-425-4070'] },
      { from: 'Boro Park', name: 'Chesed of Boro Park', phones: ['+1 718-431-0111'] },
    ]
    const both = (liaison: string, rides: { name: string; info: string; phone1: string }[]) => ({ ...record(liaison), services: rides.map((r) => ({ ...r, type: 'transportations' })) })
    const DARCHEI = { name: 'Darchei Chesed', info: 'Servicing: Monsey', phone1: '+1 845-425-4070' }
    const BORO = { name: 'Chesed of Boro Park', info: 'Servicing: Boro Park', phone1: '+1 718-431-0111' }

    beforeEach(() => {
      m.getCategoryById.mockResolvedValue(CATEGORY)
      m.listing = { ...m.listing!, details: { ...(m.listing!.details as object), transportation: RIDES } }
    })

    it('files each box Refuah changes on its own, with only that box’s change', async () => {
      refuahAnswers(both('+1 215-805-9000', [{ ...DARCHEI, phone1: '+1 845-555-0118' }, BORO]))
      const out = await runRefuahWatch('philly', URL_, HOSPITAL)
      expect(out).toMatchObject({ ok: true, filed: 2, check: { result: 'differs', queue: 'filed' } })
      const [who, rides] = m.submitListingUpdate.mock.calls.map((c) => c[2])
      expect(who.source.section).toEqual({ section: 'Who to call', keys: ['liaisons'] })
      expect(who.details.liaisons[0].phones).toEqual(['+1 215-805-9000'])
      expect(who.details.transportation).toEqual(RIDES)
      expect(rides.source.section).toEqual({ section: 'Rides', keys: ['transportation'] })
      expect(rides.details.transportation[0].phones).toEqual(['+1 845-555-0118'])
      expect(rides.details.liaisons[0].phones).toEqual(['+1 215-805-8668'])
      // One email for the run.
      expect(m.sendWatchDigest).toHaveBeenCalledTimes(1)
    })

    it('remembers what came from Refuah, and takes off only that when Refuah drops it', async () => {
      refuahAnswers(both('+1 215-805-8668', [DARCHEI, BORO]))
      const first = await runRefuahWatch('philly', URL_, HOSPITAL)
      expect(first).toMatchObject({ ok: true, filed: 0, check: { result: 'agrees' } })
      const had = (first as { check: { refuahHad: string[] } }).check.refuahHad
      expect(had).toContain('transportation:chesedofboropark')

      // A ride added by hand since, and Boro Park gone from Refuah.
      m.listing = { ...m.listing!, details: { ...(m.listing!.details as object), transportation: [...RIDES, { name: 'Philly Chesed Rides', phones: ['+1 215-555-0199'] }] } }
      vi.restoreAllMocks()
      refuahAnswers(both('+1 215-805-8668', [DARCHEI]))
      const out = await runRefuahWatch('philly', URL_, HOSPITAL, { ...(first as { check: object }).check, at: '2026-10-21T00:00:00Z' } as never)
      expect(out).toMatchObject({ ok: true, filed: 1 })
      const [payload] = m.submitListingUpdate.mock.calls.map((c) => c[2])
      expect(payload.details.transportation.map((e: { name: string }) => e.name)).toEqual(['Darchei Chesed', 'Philly Chesed Rides'])
      // Never matched, it isn't remembered as Refuah's.
      expect((out as { check: { refuahHad: string[] } }).check.refuahHad).not.toContain('transportation:phillychesedrides')
    })

    it('what Refuah now says of a box replaces its suggestion still waiting; the same one waits', async () => {
      refuahAnswers(both('+1 215-805-8668', [{ ...DARCHEI, phone1: '+1 845-555-0118' }, BORO]))
      m.earlier = [{ id: 'old', status: 'pending', payload: { details: { transportation: [{ ...RIDES[0], phones: ['+1 845-555-0000'] }, RIDES[1]] }, source: { section: { section: 'Rides', keys: ['transportation'] } } } }]
      expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: true, filed: 1, check: { queue: 'filed' } })
      expect(m.replacePendingSuggestion).toHaveBeenCalledWith('philly', 'old', expect.objectContaining({ source: expect.objectContaining({ section: { section: 'Rides', keys: ['transportation'] } }) }), expect.any(String))
      expect(m.submitListingUpdate).not.toHaveBeenCalled()

      m.replacePendingSuggestion.mockClear()
      m.earlier = [{ id: 'old', status: 'pending', payload: { details: { transportation: [{ ...RIDES[0], phones: ['+1 845-555-0118'] }, RIDES[1]] }, source: { section: { section: 'Rides', keys: ['transportation'] } } } }]
      expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: true, filed: 0, check: { queue: 'waiting' } })
      expect(m.replacePendingSuggestion).not.toHaveBeenCalled()
    })
  })

  it('needs the hospital it’s for', async () => {
    expect(await runRefuahWatch('philly', URL_, null)).toMatchObject({ ok: false, error: expect.stringContaining('Tie this watch') })
  })
})
