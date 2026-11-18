// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EnrichedSubmission } from '@/types'
import { SHUL } from '@/test/editorFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { ChangeOnItsOwn } from './TodoChange'
import { stepsIn } from '@/lib/stepAddress'

// A change opened on its own (Read now on a saved place) is To do's change
// screen: the same rows in the listing's editor, the same two answers named
// by what it changes, its parts as switches. It used to be ChangeReview,
// with "Edit, then update" and "Leave it", so one change was answered two
// ways depending on where it was opened.

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12, 12, 0))
  window.history.replaceState(null, '', '/philly/admin/places?place=mi&found=s1')
  mockRouter.push.mockImplementation((url: string) => window.history.pushState({}, '', url))
  mockRouter.replace.mockImplementation((url: string) => window.history.replaceState({}, '', url))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  mockRouter.push.mockReset()
  mockRouter.replace.mockReset()
})

const user = () => userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })
const usual = [{ id: 'a', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }]
const post = (from: string, to: string, on: string) => ({ id: 'p', name: 'Times', from, to, mode: 'replace', kind: 'week', minyanim: [{ id: 'x', tefillah: 'mincha', on: [on], time: '4:45pm' }] })

function change(details: Record<string, unknown>, was: Record<string, unknown> = { minyanim: usual }): EnrichedSubmission {
  return {
    id: 's1',
    operation: 'update',
    target_type: 'listing',
    target_id: 'mi',
    status: 'pending',
    created_at: '2026-10-12T12:00:00Z',
    categoryLabel: 'Shuls',
    payload: { category: 'synagogue', name: 'Mekor', address: '', details },
    current: { id: 'mi', category: 'synagogue', name: 'Mekor', address: '', details: was },
  } as unknown as EnrichedSubmission
}

type Props = Partial<Parameters<typeof ChangeOnItsOwn>[0]>
const show = (s: EnrichedSubmission, props: Props = {}) =>
  renderWithProviders(<ChangeOnItsOwn submission={s} category={SHUL} back={() => {}} token="t" onModerate={() => {}} onUpdated={() => {}} {...props} />)

describe('To do’s answers, not ChangeReview’s', () => {
  it('two answers named by the change; no "Edit, then update", no "Leave it", no "1 of 1"', () => {
    show(change({ minyanim: [{ ...usual[0], time: '9:30am' }] }))
    const decide = screen.getByRole('group', { name: 'Decide' })
    const labels = within(decide).getAllByRole('button').map((b) => b.textContent)
    expect(labels).toHaveLength(2)
    expect(labels[0]).toMatch(/9:30/)
    expect(screen.queryByRole('button', { name: 'Edit, then update' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Leave it' })).not.toBeInTheDocument()
    expect(screen.queryByText('1 of 1')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'The next place' })).not.toBeInTheDocument()
  })

  it('the second answer turns it down', async () => {
    const onModerate = vi.fn()
    show(change({ minyanim: [{ ...usual[0], time: '9:30am' }] }), { onModerate })
    const decide = screen.getByRole('group', { name: 'Decide' })
    await user().click(within(decide).getAllByRole('button')[1])
    expect(onModerate).toHaveBeenCalledWith('s1', 'rejected', undefined)
  })
})

// The user, Oct 31: "If I click update then submit. I can't actually click
// on this week's schedule."
describe('a change to a shul’s week', () => {
  it('opens this week’s times, with what the change proposes', () => {
    show(change({ minyanim: usual, minyanim_schedules: [post('2026-10-11', '2026-10-17', '2026-10-12')] }))
    expect(screen.getByTestId('editor-open-minyans:this_week')).toHaveTextContent('4:45 PM')
    expect(screen.queryByTestId('editor-open-minyans:next_week')).not.toBeInTheDocument()
  })

  it('opens next week’s when that’s the one it changes', () => {
    show(change({ minyanim: usual, minyanim_schedules: [post('2026-10-18', '2026-10-24', '2026-10-19')] }))
    expect(screen.getByTestId('editor-open-minyans:next_week')).toHaveTextContent('4:45 PM')
    expect(screen.queryByTestId('editor-open-minyans:this_week')).not.toBeInTheDocument()
  })
})

// The user, Nov 2: one thing at a time. A change with two parts is two
// switches, each answered on its own.
describe('a change with more than one part', () => {
  const shul = (website: string) => change({ minyanim: [{ ...usual[0], time: '9:30am' }], website: 'https://new.example' }, { minyanim: usual, website })

  it('shows one part at a time; turning it down answers that part only', async () => {
    const onModerate = vi.fn()
    show(shul('https://old.example'), { onModerate })
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Website', 'Usual Shabbos times'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    await user().click(tabs[1])
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true')
    await user().click(within(screen.getByRole('group', { name: 'Decide' })).getAllByRole('button')[1])
    expect(onModerate).toHaveBeenCalledWith('s1', 'rejected', 'minyanim:shabbos')
  })

  it('read again once a part is answered: the next one opens, the answered one ticked', async () => {
    function Queue() {
      const [s, setS] = useState(shul('https://old.example'))
      return <ChangeOnItsOwn submission={s} category={SHUL} back={() => {}} token="t" onModerate={() => setS(shul('https://new.example'))} onUpdated={() => {}} />
    }
    renderWithProviders(<Queue />)
    await user().click(within(screen.getByRole('group', { name: 'Decide' })).getAllByRole('button')[1])
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Website (done)', 'Usual Shabbos times'])
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true')
  })
})

// AGENTS.md: "A screen of its own is an entry in the browser's history".
describe('a time opened in it is in the address', () => {
  const here = () => window.location.pathname + window.location.search
  const pop = (url: string) =>
    act(() => {
      window.history.replaceState({}, '', url)
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
    })
  const week = () => change({ minyanim: usual, minyanim_schedules: [post('2026-10-11', '2026-10-17', '2026-10-12')] })

  it('an entry of its own; Back closes it, Forward and a reload open it again', async () => {
    const first = show(week())
    const start = here()
    await user().click(within(screen.getByTestId('editor-open-minyans:this_week')).getByRole('button', { name: /4:45/ }))
    await waitFor(() => expect(stepsIn(window.location.search, 'step', 's1')).toEqual(['minyans:this_week#0']))
    const time = here()
    expect(screen.getByRole('button', { name: 'Remove this minyan' })).toBeInTheDocument()
    pop(start)
    expect(screen.queryByRole('button', { name: 'Remove this minyan' })).not.toBeInTheDocument()
    pop(time)
    expect(await screen.findByRole('button', { name: 'Remove this minyan' })).toBeInTheDocument()
    first.unmount()
    show(week())
    expect(await screen.findByRole('button', { name: 'Remove this minyan' })).toBeInTheDocument()
    expect(here()).toBe(time)
  })
})
