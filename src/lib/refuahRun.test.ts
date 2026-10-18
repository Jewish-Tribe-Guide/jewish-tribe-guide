import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  listing: null as Record<string, unknown> | null,
  earlier: [] as { payload: unknown }[],
  submitListingUpdate: vi.fn(),
  sendWatchDigest: vi.fn(),
  getCategoryById: vi.fn(),
  revalidateTag: vi.fn(),
  // Each write: what it set, and the filters it was conditional on.
  updates: [] as { table: string; set: Record<string, unknown>; where: [string, string, unknown][] }[],
  // What the guarded write found to change: none when the row moved on.
  updated: [{ id: 'x' }] as { id: string }[],
  updateError: null as { message: string } | null,
}))

// The two reads the run makes: the listing (maybeSingle), and what the watch
// filed for it before (awaited as a list). And the one write, the date.
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      let write: (typeof m.updates)[number] | null = null
      const q = {
        select: () => q,
        update: (set: Record<string, unknown>) => {
          write = { table, set, where: [] }
          m.updates.push(write)
          return q
        },
        eq: (k: string, v: unknown) => (write?.where.push(['eq', k, v]), q),
        is: (k: string, v: unknown) => (write?.where.push(['is', k, v]), q),
        maybeSingle: async () => ({ data: m.listing, error: null }),
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve(
            write
              ? { data: m.updateError ? null : m.updated, error: m.updateError }
              : { data: table === 'submission' ? m.earlier : [], error: null },
          ).then(ok),
      }
      return q
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidateTag: m.revalidateTag }))
vi.mock('@/lib/submissionStore', () => ({ submitListingUpdate: m.submitListingUpdate }))
vi.mock('@/lib/email', () => ({ sendWatchDigest: m.sendWatchDigest }))
vi.mock('@/lib/categoryStore', () => ({ getCategoryById: m.getCategoryById }))

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
  m.sendWatchDigest.mockReset().mockResolvedValue(undefined)
  m.getCategoryById.mockReset().mockResolvedValue({ detailFields: [{ key: 'liaisons', label: 'Liaisons', type: 'contacts' }] })
  m.revalidateTag.mockReset()
  m.earlier = []
  m.updates = []
  m.updated = [{ id: HOSPITAL }]
  m.updateError = null
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
    expect(out).toMatchObject({ ok: true, filed: 0 })
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toMatchObject({ path: 'hospitals:getWithReferences', args: { id: 'jx77h9d00qztqgbbe8e0rfj1r589mgf5' } })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('files a difference as a suggestion from Refuah, named, so approval dates it “From Refuah”', async () => {
    refuahAnswers(record('+1 215-805-9000'))
    const out = await runRefuahWatch('philly', URL_, HOSPITAL)
    expect(out).toMatchObject({ ok: true, filed: 1 })
    const [community, id, payload, note, by] = m.submitListingUpdate.mock.calls[0]
    expect([community, id, by]).toEqual(['philly', HOSPITAL, { name: REFUAH_WATCH_NAME }])
    expect(payload.details.liaisons).toEqual([{ name: 'Bikur Cholim of Philadelphia', who: 'Mrs. Schwartz', phones: ['+1 215-805-9000'] }])
    expect(payload.details.r).toBe(URL_)
    expect(payload.source).toMatchObject({ readBy: 'automatic', from: 'Refuah', named: 'Refuah' })
    expect(note).toContain('phone +1 215-805-8668 → +1 215-805-9000')
    expect(m.sendWatchDigest).toHaveBeenCalledWith('philly', 'Refuah', [expect.objectContaining({ name: 'Hospital of the University of Pennsylvania' })])
  })

  it('doesn’t file the same suggestion twice, whatever became of the first', async () => {
    refuahAnswers(record('+1 215-805-9000'))
    m.earlier = [{ payload: { details: { liaisons: [{ name: 'Bikur Cholim of Philadelphia', who: 'Mrs. Schwartz', phones: ['+1 215-805-9000'] }] } } }]
    expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: true, filed: 0 })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  // Penn Presbyterian and Pennsylvania Hospital, Oct 17: on Refuah with
  // nothing under them. A good read, not a broken watch emailing every day.
  it('a hospital Refuah has nothing for is a good read with nothing to file', async () => {
    refuahAnswers({ name: 'Penn Presbyterian Medical Center', liaisons: [], services: [] })
    expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: true, filed: 0 })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('a record in a shape it doesn’t know, or an error, is a failed run, never a card', async () => {
    refuahAnswers({ liaisons: 'none' })
    expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: false })
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'error', errorMessage: 'Could not find function' })))
    expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: false, error: expect.stringContaining('Could not find function') })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  // Refuah saying the same thing day after day is Refuah vouching for it:
  // the hospital's boxes say "From Refuah, Oct 18" instead of going stale
  // and asking "Still right?" 90 days after the last person looked.
  describe('dating the listing when Refuah agrees', () => {
    const NOW = '2026-10-18T07:30:00.000Z'
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(NOW))
    })
    afterEach(() => vi.useRealTimers())

    it('dates it “From Refuah”, today, and touches nothing else', async () => {
      refuahAnswers(record('+1 215-805-8668'))
      const before = { ...m.listing!.details as Record<string, unknown>, confirmedAt: '2026-10-07T01:46:49.573Z', sectionConfirmed: { liaisons: '2026-10-12T10:00:00.000Z' } }
      m.listing!.details = before
      expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: true, filed: 0 })
      expect(m.updates).toHaveLength(1)
      const [{ table, set, where }] = m.updates
      expect(table).toBe('resource')
      // A visitor's tap on one box is theirs, and stays.
      expect(set).toEqual({ details: { ...before, confirmedAt: NOW, confirmedFrom: { from: 'Refuah', at: NOW } } })
      // Only if the listing is still exactly what was compared: an approval
      // or a tap landing in between leaves it alone, never undone.
      expect(where).toEqual(expect.arrayContaining([['eq', 'id', HOSPITAL], ['eq', 'community_id', 'philly'], ['eq', 'status', 'approved'], ['eq', 'details', JSON.stringify(before)]]))
      expect(m.revalidateTag).toHaveBeenCalledWith('resources:philly', 'max')
      expect(m.submitListingUpdate).not.toHaveBeenCalled()
    })

    it('never dates over a newer confirmation by a person', async () => {
      refuahAnswers(record('+1 215-805-8668'))
      m.listing!.details = { ...(m.listing!.details as Record<string, unknown>), confirmedAt: '2026-10-18T09:00:00.000Z' }
      expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: true, filed: 0 })
      m.listing!.details = { ...(m.listing!.details as Record<string, unknown>), confirmedAt: NOW }
      expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: true, filed: 0 })
      expect(m.updates).toHaveLength(0)
    })

    it('doesn’t date it when it filed a difference, or one it filed before', async () => {
      refuahAnswers(record('+1 215-805-9000'))
      expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: true, filed: 1 })
      m.earlier = [{ payload: { details: { liaisons: [{ name: 'Bikur Cholim of Philadelphia', who: 'Mrs. Schwartz', phones: ['+1 215-805-9000'] }] } } }]
      expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: true, filed: 0 })
      expect(m.updates).toHaveLength(0)
    })

    it('doesn’t date it when Refuah has nothing for it, or nothing the guide has a box for', async () => {
      refuahAnswers({ name: 'Penn Presbyterian Medical Center', liaisons: [], services: [] })
      expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: true, filed: 0 })
      vi.restoreAllMocks()
      refuahAnswers(record('+1 215-805-8668'))
      m.getCategoryById.mockResolvedValue({ detailFields: [] })
      expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: true, filed: 0 })
      expect(m.updates).toHaveLength(0)
    })

    it('doesn’t date it when the read failed', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }))
      expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: false })
      expect(m.updates).toHaveLength(0)
    })

    it('a listing that changed under it is left for tomorrow’s run, not an error', async () => {
      refuahAnswers(record('+1 215-805-8668'))
      m.updated = []
      expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: true, filed: 0 })
      expect(m.revalidateTag).not.toHaveBeenCalled()
    })

    it('a date it couldn’t save is a failed run, so the Watches tab says so', async () => {
      refuahAnswers(record('+1 215-805-8668'))
      m.updateError = { message: 'boom' }
      expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: false, error: expect.stringContaining('boom') })
    })

    // The test project's daily run (scripts/run-test-watches.mts) is plain
    // Node, where Next's cache isn't there to invalidate.
    it('outside Next, the date is still saved', async () => {
      refuahAnswers(record('+1 215-805-8668'))
      m.revalidateTag.mockImplementation(() => {
        throw new Error('Invariant: static generation store missing')
      })
      expect(await runRefuahWatch('philly', URL_, HOSPITAL)).toMatchObject({ ok: true, filed: 0 })
      expect(m.updates).toHaveLength(1)
    })
  })

  it('needs the hospital it’s for', async () => {
    expect(await runRefuahWatch('philly', URL_, null)).toMatchObject({ ok: false, error: expect.stringContaining('Tie this watch') })
  })
})
