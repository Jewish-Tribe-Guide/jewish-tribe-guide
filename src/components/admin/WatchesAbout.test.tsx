// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { NIGHTLY_JOBS } from '@/lib/jobRuns'
import { mockRouter } from '@/test/nextNavigationMock'
import WatchesAbout, { READS } from './WatchesAbout'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community/admin/watches/about',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(cleanup)

// The user, Nov 9: "watches is very important but also something that
// could be confusing to an admin."
describe('How watches work', () => {
  it('says what a watch is, what each reads and when, and what is left to the admin', () => {
    renderWithProviders(<WatchesAbout />)
    expect(screen.getByRole('heading', { name: 'How watches work' })).toBeInTheDocument()
    expect(screen.getByText(/^A watch is the site reading a source on its own/)).toBeInTheDocument()
    const reads = screen.getByRole('region', { name: 'What’s read, and when' })
    expect(within(reads).getAllByRole('listitem').map((li) => li.firstElementChild?.textContent)).toEqual(['Google', 'Websites, menus and lists', 'Emails', 'Links', 'Look again'])
    const todo = screen.getByRole('region', { name: 'What you do' })
    expect(within(todo).getByRole('link', { name: /^Add a place’s sources/ })).toHaveAttribute('href', '/test-community/admin/places')
    expect(within(todo).getByRole('link', { name: /^Say yes or no/ })).toHaveAttribute('href', '/test-community/admin')
    expect(within(todo).getByRole('link', { name: /^Turn a job off/ })).toHaveAttribute('href', '/test-community/admin/watches')
  })

  // What it says of how often is what the jobs' schedules are, so changing
  // one fails here until the words follow.
  it('says how often each job runs, as its schedule does', () => {
    const cron = (id: string) => NIGHTLY_JOBS.find((j) => j.id === id)!.cron
    const said = (who: string) => READS.find((r) => r.who === who)!.what
    expect(cron('sync-hours')).toMatch(/^\d+ \d+ \* \* \*$/)
    expect(said('Google')).toMatch(/^Every night/)
    expect(cron('watches')).toMatch(/^\d+ \d+ \* \* \*$/)
    expect(said('Websites, menus and lists')).toMatch(/^Every night/)
    expect(cron('check-links')).toMatch(/^\d+ \d+ \* \* 0$/)
    expect(said('Links')).toMatch(/^Every Sunday/)
  })
})
