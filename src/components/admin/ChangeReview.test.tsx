// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EnrichedSubmission } from '@/types'
import { SHUL } from '@/test/editorFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import ChangeReview from './ChangeReview'
import { stepsIn } from '@/lib/stepAddress'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12, 12, 0))
  // The router writes the address at once, as a landed navigation would:
  // the screens wait for each move to land before the next (and with Date
  // frozen, would wait for ever).
  window.history.replaceState(null, '', '/philly/admin/todo?place=mi')
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

function change(schedule: object): EnrichedSubmission {
  return {
    id: 's1',
    operation: 'update',
    target_type: 'resource',
    target_id: 'mi',
    status: 'pending',
    created_at: '2026-10-12T12:00:00Z',
    categoryLabel: 'Shuls',
    payload: { category: 'synagogue', name: 'Mekor', address: '', details: { minyanim: usual, minyanim_schedules: [schedule] } },
    current: { id: 'mi', category: 'synagogue', name: 'Mekor', address: '', details: { minyanim: usual } },
  } as unknown as EnrichedSubmission
}

const open = async (schedule: object) => {
  renderWithProviders(<ChangeReview submission={change(schedule)} category={SHUL} position={{ at: 0, total: 1, back: () => {} }} token="t" onModerate={() => {}} onUpdated={() => {}} />)
  await user().click(screen.getByRole('button', { name: 'Edit, then update' }))
}

// The user, Oct 31: "If I click update then submit. I can't actually click
// on this week's schedule."
describe('Edit, then update, on a change to a shul’s week', () => {
  it('opens this week’s times, with what the change proposes', async () => {
    await open(post('2026-10-11', '2026-10-17', '2026-10-12'))
    expect(screen.getByTestId('editor-open-minyans:this_week')).toHaveTextContent('4:45 PM')
    expect(screen.queryByTestId('editor-open-minyans:next_week')).not.toBeInTheDocument()
  })

  it('opens next week’s when that’s the one it changes', async () => {
    await open(post('2026-10-18', '2026-10-24', '2026-10-19'))
    expect(screen.getByTestId('editor-open-minyans:next_week')).toHaveTextContent('4:45 PM')
    expect(screen.queryByTestId('editor-open-minyans:this_week')).not.toBeInTheDocument()
  })
})

describe('a change as one list', () => {
  const show = (details: Record<string, unknown>, was: Record<string, unknown>) =>
    renderWithProviders(
      <ChangeReview
        submission={{ ...change({}), payload: { category: 'synagogue', name: 'Mekor', address: '', details }, current: { id: 'mi', category: 'synagogue', name: 'Mekor', address: '', details: was } } as unknown as EnrichedSubmission}
        category={SHUL}
        position={{ at: 0, total: 1, back: () => {} }}
        token="t"
        onModerate={() => {}}
        onUpdated={() => {}}
      />,
    )

  it('a week’s time, by its day: the old crossed out, the new highlighted, no two columns', () => {
    const was = { minyanim: usual, minyanim_schedules: [post('2026-10-11', '2026-10-17', '2026-10-12')] }
    const now = { minyanim: usual, minyanim_schedules: [{ ...post('2026-10-11', '2026-10-17', '2026-10-12'), minyanim: [{ id: 'x', tefillah: 'mincha', on: ['2026-10-12'], time: '5:00pm' }] }] }
    show(now, was)
    const list = screen.getByRole('region', { name: 'The schedule' })
    expect(list).toHaveTextContent('Mon Oct 12')
    expect(screen.getByRole('deletion')).toHaveTextContent('Mincha 4:45 PM')
    expect(screen.getByRole('insertion')).toHaveTextContent('Mincha 5 PM')
    expect(screen.queryByText('On the site now')).not.toBeInTheDocument()
    expect(screen.queryByText('Would show')).not.toBeInTheDocument()
  })

  it('a usual time: the rest of the box stays plain', () => {
    const more = [...usual, { id: 'b', tefillah: 'mincha', days: ['sat'], time: '1:00pm' }]
    show({ minyanim: [{ ...more[0], time: '9:30am' }, more[1]] }, { minyanim: more })
    expect(screen.getByRole('deletion')).toHaveTextContent('Shacharis 9 AM')
    expect(screen.getByRole('insertion')).toHaveTextContent('Shacharis 9:30 AM')
    expect(screen.getByRole('region', { name: 'Usual Shabbos times' })).toHaveTextContent('Mincha 1 PM')
  })

  it('a plain field: old and new in one place', () => {
    show({ minyanim: usual, notes: 'Side door' }, { minyanim: usual, notes: 'Front door' })
    expect(screen.getByRole('deletion')).toHaveTextContent('Front door')
    expect(screen.getByRole('insertion')).toHaveTextContent('Side door')
  })
})

// The user, Nov 2: one thing at a time. A change with two parts is two
// switches, each answered on its own.
describe('a change with more than one part', () => {
  const twoParts = (onModerate: (...a: unknown[]) => Promise<'partial' | 'whole' | 'failed'>) =>
    renderWithProviders(
      <ChangeReview
        submission={{ ...change({}), payload: { category: 'synagogue', name: 'Mekor', address: '', details: { minyanim: [{ ...usual[0], time: '9:30am' }], website: 'https://new.example' } }, current: { id: 'mi', category: 'synagogue', name: 'Mekor', address: '', details: { minyanim: usual, website: 'https://old.example' } } } as unknown as EnrichedSubmission}
        category={SHUL}
        position={{ at: 0, total: 1, back: () => {} }}
        token="t"
        onModerate={onModerate}
        onUpdated={() => {}}
      />,
    )

  it('shows one part at a time, and Update answers that part only, then opens the next', async () => {
    const onModerate = vi.fn(async () => 'partial' as const)
    twoParts(onModerate)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Website', 'Usual Shabbos times'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('insertion')).toHaveTextContent('https://new.example')
    expect(screen.queryByText('Shacharis 9:30 AM')).not.toBeInTheDocument()

    await user().click(screen.getByRole('button', { name: 'Update the listing' }))
    expect(onModerate).toHaveBeenCalledWith('s1', 'approved', undefined, 'website')
    expect(screen.getAllByRole('tab')[0]).toHaveTextContent('(done)')
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('insertion')).toHaveTextContent('Shacharis 9:30 AM')
  })

  it('with one part left, the switches stay, the answered one ticked', async () => {
    const answered = vi.fn()
    const shul = (website: string) =>
      ({ ...change({}), payload: { category: 'synagogue', name: 'Mekor', address: '', details: { minyanim: [{ ...usual[0], time: '9:30am' }], website: 'https://new.example' } }, current: { id: 'mi', category: 'synagogue', name: 'Mekor', address: '', details: { minyanim: usual, website } } }) as unknown as EnrichedSubmission
    // Read again once a part is answered: the website is on the listing now.
    function Queue() {
      const [s, setS] = useState(shul('https://old.example'))
      return (
        <ChangeReview
          submission={s}
          category={SHUL}
          position={{ at: 0, total: 1, back: () => {} }}
          token="t"
          onModerate={async (...a) => {
            answered(...a)
            setS(shul('https://new.example'))
            return 'partial' as const
          }}
          onUpdated={() => {}}
        />
      )
    }
    renderWithProviders(<Queue />)
    await user().click(screen.getByRole('button', { name: 'Update the listing' }))
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Website (done)', 'Usual Shabbos times'])
    await user().click(screen.getByRole('button', { name: 'Update the listing' }))
    expect(answered).toHaveBeenLastCalledWith('s1', 'approved', undefined, 'minyanim:shabbos')
  })

  it('Leave it leaves the open part straight away, with no reason asked: nobody is told until the last', async () => {
    const onModerate = vi.fn(async () => 'partial' as const)
    twoParts(onModerate)
    await user().click(screen.getAllByRole('tab')[1])
    await user().click(screen.getByRole('button', { name: 'Leave it' }))
    expect(onModerate).toHaveBeenCalledWith('s1', 'rejected', undefined, 'minyanim:shabbos')
    expect(screen.queryByLabelText(/Why, for whoever sent it/)).not.toBeInTheDocument()
  })
})

// AGENTS.md: "A screen of its own is an entry in the browser's history".
// Edit, then update, and a time opened in it, were state only: Back left
// the change, and a reload lost the edit.
describe('Edit, then update, is in the address', () => {
  const here = () => window.location.pathname + window.location.search
  const pop = (url: string) =>
    act(() => {
      window.history.replaceState({}, '', url)
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
    })
  const show = () =>
    renderWithProviders(<ChangeReview submission={change(post('2026-10-11', '2026-10-17', '2026-10-12'))} category={SHUL} position={{ at: 0, total: 1, back: () => {} }} token="t" onModerate={() => {}} onUpdated={() => {}} />)
  it('opening it, then a time in it, are an entry each; Back closes each in turn', async () => {
    show()
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Edit, then update' }))
    await waitFor(() => expect(stepsIn(window.location.search, 'edit', 's1')).toEqual(['edit']))
    const edit = here()
    await u.click(within(screen.getByTestId('editor-open-minyans:this_week')).getByRole('button', { name: /4:45/ }))
    await waitFor(() => expect(stepsIn(window.location.search, 'edit', 's1')).toEqual(['edit', 'minyans:this_week#0']))
    expect(mockRouter.push).toHaveBeenCalledTimes(2)

    expect(screen.getByRole('button', { name: 'Remove this minyan' })).toBeInTheDocument()
    pop(edit)
    expect(screen.queryByRole('button', { name: 'Remove this minyan' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /The change$/ })).toBeInTheDocument()
    pop('/philly/admin/todo?place=mi')
    expect(screen.getByRole('button', { name: 'Edit, then update' })).toBeInTheDocument()
  })

  it('a reload, or Forward, on a time in it opens the edit and that time', async () => {
    const first = show()
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Edit, then update' }))
    await u.click(within(screen.getByTestId('editor-open-minyans:this_week')).getByRole('button', { name: /4:45/ }))
    await waitFor(() => expect(stepsIn(window.location.search, 'edit', 's1')).toHaveLength(2))
    const time = here()
    pop('/philly/admin/todo?place=mi')
    expect(screen.getByRole('button', { name: 'Edit, then update' })).toBeInTheDocument()
    // Forward.
    pop(time)
    expect(await screen.findByRole('button', { name: 'Remove this minyan' })).toBeInTheDocument()
    first.unmount()
    // A reload.
    show()
    expect(await screen.findByRole('button', { name: 'Remove this minyan' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit, then update' })).not.toBeInTheDocument()
    expect(here()).toBe(time)
  })
})
