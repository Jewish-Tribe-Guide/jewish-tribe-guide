// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { TodoData } from '@/lib/useTodo'
import type { TodoPlace } from '@/lib/todoPlaces'
import TodoList, { ALL_OLDEST_FIRST } from './TodoList'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin',
  useSearchParams: () => new URLSearchParams(),
}))

const empty: TodoData = { submissions: [], responses: [], unmatched: [], setup: null }

function Host({ data, onOpen }: { data: TodoData; onOpen: (p: TodoPlace) => void }) {
  const [view, setView] = useState(ALL_OLDEST_FIRST)
  return <TodoList data={data} categoriesById={new Map()} view={view} onView={setView} onOpen={onOpen} />
}
const show = (data: TodoData, onOpen: (p: TodoPlace) => void = () => {}) => renderWithProviders(<Host data={data} onOpen={onOpen} />, { community: { slug: 'philly' } })
const rowNames = () => screen.getAllByRole('button', { name: /^Open / }).map((b) => b.getAttribute('aria-label'))

afterEach(cleanup)

// The "one tap per place" boards (Nov 2): a row per place, what's waiting
// there in one grey line, no boxes by kind.
describe('To do, a row per place', () => {
  it('puts everything waiting at a place in its one row, and opens the place', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    show(
      {
        ...empty,
        waiting: [{ id: 'r', name: 'Rita’s', kind: 'Food', line: 'Closed, says Google' }],
        notRead: [{ id: 'r', name: 'Rita’s', line: 'Website didn’t load' }],
        responses: [{ id: 'f', title: 'Feedback', line: 'this website is cool', createdAt: '2026-11-01T12:00:00Z' }],
      },
      onOpen,
    )
    expect(rowNames()).toEqual(['Open Feedback', 'Open Rita’s'])
    expect(screen.getByRole('button', { name: 'Open Rita’s' })).toHaveTextContent('Closed, says Google · Website didn’t load')
    expect(screen.queryByRole('region', { name: /Not being read|Changes/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Open Rita’s' }))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ key: 'r', name: 'Rita’s' }))
  })

  it('finds a place by name, and the filter keeps only places with that kind waiting', async () => {
    const user = userEvent.setup()
    show({
      ...empty,
      waiting: [{ id: 'r', name: 'Rita’s', kind: 'Food', line: 'Closed, says Google' }],
      notRead: [{ id: 'b', name: 'Bnai Abraham', line: 'Their email came 3 weeks ago' }],
      unmatched: [{ id: 'n', name: 'New Deli', category: 'food' }],
    })
    await user.type(screen.getByRole('searchbox', { name: 'Find a place by name' }), 'deli')
    expect(rowNames()).toEqual(['Open New Deli'])
    await user.clear(screen.getByRole('searchbox', { name: 'Find a place by name' }))
    await user.click(screen.getByRole('button', { name: /^Show/ }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Broken checks/ }))
    expect(rowNames()).toEqual(['Open Bnai Abraham', 'Open New Deli'])
    // All again.
    await user.click(screen.getByRole('menuitemcheckbox', { name: /^All/ }))
    expect(rowNames()).toHaveLength(3)
  })

  // K1Sort, H2Open: the menus name what's chosen, and the filter ticks.
  it('names what the menus have chosen, and ticks each filter picked', async () => {
    const user = userEvent.setup()
    show({ ...empty, notRead: [{ id: 'z', name: 'Zeke’s', line: 'Website didn’t load' }] })
    expect(screen.getByRole('button', { name: /^Show/ })).toHaveTextContent('All')
    expect(screen.getByRole('button', { name: /^Sort/ })).toHaveTextContent('Oldest first')
    await user.click(screen.getByRole('button', { name: /^Show/ }))
    expect(screen.getByRole('menuitemcheckbox', { name: 'All (1)' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Broken checks/ }))
    expect(screen.getByRole('menuitemcheckbox', { name: 'All (1)' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: /^Show/ })).toHaveTextContent('Broken checks')
  })

  it('sorts by name', async () => {
    const user = userEvent.setup()
    show({ ...empty, notRead: [{ id: 'z', name: 'Zeke’s', line: 'Website didn’t load' }, { id: 'a', name: 'Abe’s', line: 'Website didn’t load' }] })
    await user.click(screen.getByRole('button', { name: /^Sort/ }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Name' }))
    expect(rowNames()).toEqual(['Open Abe’s', 'Open Zeke’s'])
  })

  it('with nothing waiting, says so', () => {
    show(empty)
    expect(screen.getByText('Nothing to do')).toBeTruthy()
    expect(screen.getByText('Every place was read this morning')).toBeTruthy()
    expect(screen.queryByRole('searchbox')).toBeNull()
  })
})
