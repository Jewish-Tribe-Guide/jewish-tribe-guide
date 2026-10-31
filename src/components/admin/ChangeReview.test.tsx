// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EnrichedSubmission } from '@/types'
import { SHUL } from '@/test/editorFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import ChangeReview from './ChangeReview'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12, 12, 0))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
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
