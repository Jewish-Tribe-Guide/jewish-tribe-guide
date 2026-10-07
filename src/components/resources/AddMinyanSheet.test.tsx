// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { makeListing } from '@/test/providerFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import type { DateFacts } from '@/lib/schedules'
import AddMinyanSheet from './AddMinyanSheet'

vi.mock('./useListingSubmit', () => ({ TURNSTILE_ACTIVE: false }))
vi.mock('@/lib/useIsMobile', () => ({ useIsMobile: () => true }))
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/synagogue',
  useSearchParams: () => new URLSearchParams(),
}))
afterEach(() => cleanup())

const mekor = makeListing({ id: 'mekor', name: 'Mekor Habracha', category: 'synagogue', milesFromCenter: 0.2, denomination: 'Orthodox (Ashkenazi)' })
const kesher = makeListing({ id: 'kesher', name: 'Kesher Israel', category: 'synagogue', milesFromCenter: 0.9 })
const far = makeListing({ id: 'far', name: 'Chabad of the Main Line', category: 'synagogue', milesFromCenter: 6.1 })
const hoshanaRabbah: DateFacts = { date: '2026-10-02', weekday: 'fri', yomTov: false, cholHamoed: true, festival: 'Sukkos', name: 'Hoshana Rabbah' }
const aTuesday: DateFacts = { date: '2026-10-06', weekday: 'tue', yomTov: false, cholHamoed: false, festival: null, name: null }

describe('+ Add a minyan (the user’s note 2)', () => {
  let calls: { url: string; body: { update: { rows: Record<string, unknown>[] } } }[]
  let fetchMock: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    calls = []
    fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return new Response(JSON.stringify({ ok: true }))
    })
  })
  afterEach(() => fetchMock.mockRestore())

  const open = (more: object = {}) =>
    renderWithProviders(<AddMinyanSheet isOpen onClose={() => {}} shuls={[far, kesher, mekor]} day={hoshanaRabbah} shulText={(s) => String(s.denomination ?? '')} {...more} />, { community: { slug: 'philly' } })

  it('which shul, nearest first; then the time and the day looked at; sent as a new minyan every Friday', async () => {
    open()
    const pick = screen.getByTestId('add-minyan-shul')
    expect(within(pick).getAllByRole('button').map((b) => b.textContent)).toEqual(['Mekor HabrachaOrthodox (Ashkenazi)0.2 mi', 'Kesher Israel0.9 mi', 'Chabad of the Main Line6.1 mi'])
    fireEvent.click(within(pick).getByRole('button', { name: /Mekor Habracha/ }))
    expect(screen.getByRole('button', { name: 'Fri', pressed: true })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tefillah'), { target: { value: 'mincha' } })
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '1:30pm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send for a check' }))
    await screen.findByText(/An admin checks it before everyone sees it/)
    expect(calls[0].url).toBe('/api/resource/mekor/times')
    expect(calls[0].body.update.rows).toEqual([{ id: expect.any(String), day: 'fri', tefillah: 'mincha', time: '1:30pm', status: 'new' }])
  })

  it('“Only Hoshana Rabbah”: that date alone, named for it', async () => {
    open({ shulId: 'kesher', tefillah: 'mincha' })
    expect(screen.queryByTestId('add-minyan-shul')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Only Hoshana Rabbah' }))
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '6:20pm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send for a check' }))
    await screen.findByText(/An admin checks it/)
    expect(calls[0].body.update.rows).toEqual([{ id: expect.any(String), day: '2026-10-02', occasion: 'Hoshana Rabbah', tefillah: 'mincha', time: '6:20pm', status: 'new' }])
  })

  // Tidied Oct 6 (the user's five notes on this screen).
  it('Back is the header’s chevron, to “Which shul?”; no “Change” line, and none when the search named the shul', () => {
    open()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    fireEvent.click(within(screen.getByTestId('add-minyan-shul')).getByRole('button', { name: /Mekor Habracha/ }))
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull()
    expect(screen.queryByText(/Orthodox \(Ashkenazi\) ·/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByTestId('add-minyan-shul')).toBeInTheDocument()
    cleanup()
    open({ shulId: 'mekor' })
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('the time sits beside its tefillah, on one row', () => {
    open({ shulId: 'mekor' })
    expect(screen.getByLabelText('Time').parentElement).toBe(screen.getByLabelText('Tefillah').parentElement)
  })

  it('the day looked at is simply on: no explaining it, and no “only this one” on a day without a name', () => {
    open({ shulId: 'mekor', day: aTuesday })
    expect(screen.getByRole('button', { name: 'Tue', pressed: true })).toBeInTheDocument()
    expect(screen.queryByText(/day you were looking at/)).toBeNull()
    expect(screen.queryByRole('button', { name: /^Only/ })).toBeNull()
  })

  it('“Have their whole schedule?” is under Send, and opens the regular box about the shul; Back returns to the minyan as left', () => {
    open({ shulId: 'mekor', day: aTuesday })
    const send = screen.getByRole('button', { name: 'Send for a check' })
    const whole = screen.getByRole('button', { name: 'Send it instead ›' })
    expect(send.compareDocumentPosition(whole) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '7:15am' } })

    fireEvent.click(whole)
    expect(screen.getByTestId('tell-us')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Send Mekor Habracha’s schedule' })).toBeInTheDocument()
    expect(screen.getByLabelText('What did you see?')).toHaveAttribute('placeholder', expect.stringMatching(/photo or PDF of the schedule/))
    expect(screen.queryByTestId('update-times')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.queryByTestId('tell-us')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Add a minyan at Mekor Habracha' })).toBeInTheDocument()
    expect(screen.getByLabelText('Time')).toHaveValue('7:15am')
  })
})
