import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'

// "Know their Sukkos times? Add them": one special schedule, as an edit
// suggestion built on the server from the stored listing.
const m = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  verifyTurnstile: vi.fn(),
  row: vi.fn(),
  getResourceById: vi.fn(),
  getCategoryById: vi.fn(),
  submitListingUpdate: vi.fn(),
  notify: vi.fn(),
  festivals: vi.fn(),
  ui: { contributions: { add: true, edit: true, report: true } },
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit, clientIp: () => '1.2.3.4' }))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => {
      const filters: unknown[][] = []
      const chain = { select: () => chain, eq: (...a: unknown[]) => (filters.push(['eq', ...a]), chain), maybeSingle: () => m.row(filters) }
      return chain
    },
  }),
}))
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: m.verifyTurnstile }))
vi.mock('@/lib/uiConfig', () => ({ ui: m.ui }))
vi.mock('@/lib/resourceStore', () => ({ getResourceById: m.getResourceById }))
vi.mock('@/lib/categoryStore', () => ({ getCategoryById: m.getCategoryById }))
vi.mock('@/lib/submissionStore', () => ({ submitListingUpdate: m.submitListingUpdate }))
vi.mock('@/lib/email', () => ({ sendSubmissionNotification: m.notify }))
vi.mock('@/lib/festivals', () => ({ fetchFestivals: m.festivals }))

const { POST } = await import('./route')
const ID = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const ctx = () => ({ params: Promise.resolve({ id: ID }) }) as never
const req = (body: unknown) => new Request(`http://x/api/resource/${ID}/schedule`, { method: 'POST', body: JSON.stringify(body) })
const shuls = makeCategory({ id: 'synagogue', label: 'Synagogue', detailFields: [{ key: 'minyanim', label: 'Davening Times', type: 'minyanim' }] })
const regular = [{ id: 'r', tefillah: 'maariv', days: ['thu'], time: '7:45pm' }]
const older = { id: 'o', name: 'Rosh Hashanah 5787', from: '2026-09-12', to: '2026-09-13', mode: 'replace', minyanim: [{ id: 'x', tefillah: 'shacharis', on: ['yom_tov'], time: '8:00am' }] }
const listing = { id: ID, category: 'synagogue', name: 'Kesher Israel', anchorId: 'all', distance: 0, address: '412 Lombard St', minyanim: regular, minyanim_schedules: [older] }
const sukkos = {
  id: 's1',
  name: 'Sukkos 5787',
  from: '2026-09-26',
  to: '2026-10-04',
  mode: 'replace',
  minyanim: [{ id: 'a', tefillah: 'mincha_maariv', on: ['chol_hamoed'], time: '6:30pm' }],
}

const chm = (date: string, name = 'Chol HaMoed') => ({ date, yomTov: false, cholHamoed: true, name, festival: 'Sukkos' })
const SUKKOS_DAYS = {
  festival: 'Sukkos',
  name: 'Sukkos 5787',
  from: '2026-09-26',
  to: '2026-10-04',
  days: [
    { date: '2026-09-26', yomTov: true, cholHamoed: false, name: 'Sukkos', festival: 'Sukkos' },
    { date: '2026-09-27', yomTov: true, cholHamoed: false, name: 'Sukkos', festival: 'Sukkos' },
    chm('2026-09-28'),
    chm('2026-09-29'),
    chm('2026-09-30'),
    chm('2026-10-01'),
    chm('2026-10-02', 'Hoshana Rabbah'),
    { date: '2026-10-03', yomTov: true, cholHamoed: false, name: 'Shemini Atzeres', festival: 'Sukkos' },
    { date: '2026-10-04', yomTov: true, cholHamoed: false, name: 'Simchas Torah', festival: 'Sukkos' },
  ],
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-01T12:00:00Z'))
  m.ui.contributions.edit = true
  m.enforceRateLimit.mockResolvedValue(null)
  m.verifyTurnstile.mockResolvedValue(true)
  m.row.mockResolvedValue({ data: { community_id: 'philly' }, error: null })
  m.getResourceById.mockResolvedValue(listing)
  m.getCategoryById.mockResolvedValue(shuls)
  m.submitListingUpdate.mockResolvedValue({ id: 'sub' })
  m.notify.mockResolvedValue(undefined)
  m.festivals.mockResolvedValue([SUKKOS_DAYS])
})

describe('POST /api/resource/:id/schedule', () => {
  it('files the shul as stored, with this schedule beside its others, and its times in the note', async () => {
    const res = await POST(req({ schedule: sukkos, source: 'Mincha/Maariv 6:30', turnstileToken: 't' }), ctx())
    expect(await res.json()).toEqual({ ok: true })
    const [community, target, payload, note] = m.submitListingUpdate.mock.calls[0]
    expect([community, target]).toEqual(['philly', ID])
    expect(payload.details.minyanim).toEqual(regular)
    expect(payload.details.minyanim_schedules).toEqual([older, sukkos])
    expect(note).toContain('Sukkos 5787 · Sep 26 – Oct 4 · in place of the regular times')
    expect(note).toContain('Mincha & Maariv · Chol HaMoed · 6:30pm')
    expect(note).toContain('Read from what they pasted:\nMincha/Maariv 6:30')
    expect(m.notify).toHaveBeenCalled()
  })

  it('names the photo it was read from for the admin, only from the guide’s own storage', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co')
    const kept = 'https://abc.supabase.co/storage/v1/object/public/site-assets/schedule-source/1790-x7.jpeg'
    await POST(req({ schedule: sukkos, sourceUrl: kept, turnstileToken: 't' }), ctx())
    expect(m.submitListingUpdate.mock.calls[0][3]).toContain(`Read from their photo or PDF: ${kept}`)
    for (const bad of ['https://evil.example/x.jpeg', `${kept}/../../other`, 'https://abc.supabase.co/storage/v1/object/public/site-assets/listing-photo/a.jpg']) {
      m.submitListingUpdate.mockClear()
      await POST(req({ schedule: sukkos, sourceUrl: bad, turnstileToken: 't' }), ctx())
      expect(m.submitListingUpdate.mock.calls[0][3]).not.toContain('photo or PDF')
    }
    vi.unstubAllEnvs()
  })

  it('merges a schedule of the same name day by day, keeping the days it doesn’t give', async () => {
    // Already there: Chol HaMoed and Shemini Atzeres. Sent now: Hoshana
    // Rabbah's Mincha, a Chol HaMoed day. It used to replace the whole thing.
    const there = {
      ...sukkos,
      id: 'old',
      minyanim: [...sukkos.minyanim, { id: 'b', tefillah: 'shacharis', on: ['2026-10-03'], time: '9:00am' }],
    }
    m.getResourceById.mockResolvedValue({ ...listing, minyanim_schedules: [older, there] })
    const hr = { ...sukkos, id: 'new', minyanim: [{ id: 'c', tefillah: 'mincha_maariv', on: ['2026-10-02'], time: '6:20pm' }] }
    await POST(req({ schedule: hr, turnstileToken: 't' }), ctx())
    const [rh, merged] = m.submitListingUpdate.mock.calls[0][2].details.minyanim_schedules
    expect(rh).toEqual(older)
    expect(merged.id).toBe('old')
    expect(merged.minyanim.map((x: { on: string[]; time: string }) => `${x.on.join(',')} ${x.time}`)).toEqual([
      '2026-09-28,2026-09-29,2026-09-30,2026-10-01 6:30pm',
      '2026-10-03 9:00am',
      '2026-10-02 6:20pm',
    ])
  })

  it('refuses one with no times, dates far off, or a month and more long; and nothing without the bot check', async () => {
    for (const bad of [{ ...sukkos, minyanim: [] }, { ...sukkos, from: '2029-09-26', to: '2029-10-04' }, { ...sukkos, to: '2026-11-30' }, { ...sukkos, name: 'x' }]) {
      expect((await POST(req({ schedule: bad, turnstileToken: 't' }), ctx())).status, JSON.stringify(bad).slice(0, 60)).toBe(400)
    }
    m.verifyTurnstile.mockResolvedValue(false)
    expect((await POST(req({ schedule: sukkos, turnstileToken: 'x' }), ctx())).status).toBe(403)
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('not where edits are off, and not for a listing with no davening times field', async () => {
    m.ui.contributions.edit = false
    expect((await POST(req({ schedule: sukkos, turnstileToken: 't' }), ctx())).status).toBe(403)
    m.ui.contributions.edit = true
    m.getCategoryById.mockResolvedValue(makeCategory({ id: 'grocery', detailFields: [] }))
    expect((await POST(req({ schedule: sukkos, turnstileToken: 't' }), ctx())).status).toBe(404)
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })
})
