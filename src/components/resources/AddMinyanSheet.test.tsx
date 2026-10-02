// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { makeListing } from '@/test/providerFixtures'
import type { DateFacts } from '@/lib/schedules'
import AddMinyanSheet from './AddMinyanSheet'

vi.mock('./useListingSubmit', () => ({ TURNSTILE_ACTIVE: false }))
vi.mock('@/lib/useIsMobile', () => ({ useIsMobile: () => true }))
afterEach(() => cleanup())

const mekor = makeListing({ id: 'mekor', name: 'Mekor Habracha', category: 'synagogue', milesFromCenter: 0.2, denomination: 'Orthodox (Ashkenazi)' })
const kesher = makeListing({ id: 'kesher', name: 'Kesher Israel', category: 'synagogue', milesFromCenter: 0.9 })
const far = makeListing({ id: 'far', name: 'Chabad of the Main Line', category: 'synagogue', milesFromCenter: 6.1 })
const hoshanaRabbah: DateFacts = { date: '2026-10-02', weekday: 'fri', yomTov: false, cholHamoed: true, festival: 'Sukkos', name: 'Hoshana Rabbah' }

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
    render(<AddMinyanSheet isOpen onClose={() => {}} shuls={[far, kesher, mekor]} day={hoshanaRabbah} minyanimKey="minyanim" shulText={(s) => String(s.denomination ?? '')} {...more} />)

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

  it('their whole schedule is a tap away', () => {
    open({ shulId: 'mekor' })
    fireEvent.click(screen.getByRole('button', { name: /Have their whole schedule/ }))
    expect(screen.getByTestId('update-times')).toBeInTheDocument()
  })
})
