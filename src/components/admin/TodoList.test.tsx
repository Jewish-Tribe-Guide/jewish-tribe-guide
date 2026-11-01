// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import type { TodoData } from '@/lib/useTodo'
import TodoList from './TodoList'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(async () => ({ watches: [] })), parseOkJson: vi.fn() }))

const empty: TodoData = { submissions: [], responses: [], unmatched: [], setup: null }
const show = (data: TodoData) => renderWithProviders(<TodoList data={data} token="tok" categoriesById={new Map()} onOpen={() => {}} />, { community: { slug: 'philly' } })

afterEach(() => {
  cleanup()
  vi.mocked(fetchJson).mockClear()
})

describe('To do, what waits on a place', () => {
  it('counts it, and opens the place with Back to To do', () => {
    show({ ...empty, waiting: [{ id: 'r', name: 'Rita’s', kind: 'Food', line: 'Closed for now' }] })
    expect(screen.getByText('1 to decide')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Rita’s/ })).toHaveAttribute('href', '/philly/admin/watches/place/r?from=todo')
    expect(screen.getByRole('link', { name: /Rita’s/ })).toHaveTextContent('Closed for now')
  })

  it('a place Google can’t find opens the same way', () => {
    show({ ...empty, unmatched: [{ id: 'n', name: 'New Deli', category: 'food' }] as never })
    expect(screen.getByRole('link', { name: /New Deli/ })).toHaveAttribute('href', '/philly/admin/watches/place/n?from=todo')
  })
})
