// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { fetchJson } from '@/lib/fetchJson'
import type { Change } from '@/lib/whatChanged'
import WhatChangedAdmin from './WhatChangedAdmin'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/changes',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const change = (id: string, name: string, kind: Change['kind'], hidden = false): Change => ({
  id,
  rowIds: id.split('-').map(Number),
  at: '2026-09-30T15:00:00Z',
  kind,
  listing: { id: `${name}-0000`, name, category: 'grocery' },
  items: [],
  hidden,
})

beforeEach(() => {
  vi.mocked(fetchJson).mockReset()
  vi.mocked(fetchJson).mockImplementation(async (_url, init) =>
    init?.method === 'PATCH' ? { ok: true } : { changes: [change('7-8', 'ALDI', 'google'), change('9', 'Costco', 'edited', true)], timezone: 'America/New_York' },
  )
})
afterEach(() => cleanup())

async function show() {
  renderWithProviders(<WhatChangedAdmin token="tok" />, { community: { slug: 'philly' }, content: { categories: [makeCategory({ id: 'grocery', label: 'Grocery' })] } })
  act(() => {
    window.dispatchEvent(new Event('focus'))
  })
  return screen.findByTestId('what-changed-admin')
}

describe('What changed, in the admin', () => {
  it('every change and the hidden ones, each with where it came from', async () => {
    const list = await show()
    const rows = within(list).getAllByTestId('change')
    expect(rows[0]).toHaveTextContent('ALDI updated from Google')
    expect(rows[0]).toHaveTextContent('11 AM · from Google')
    expect(rows[1]).toHaveTextContent('Costco updatedHidden')
    expect(within(rows[1]).getByRole('button', { name: 'Show again: Costco' })).toBeInTheDocument()
  })

  it('Hide sends every log row of the change, then shows it as hidden', async () => {
    const user = userEvent.setup()
    await show()
    await user.click(screen.getByRole('button', { name: 'Hide: ALDI' }))
    const patch = vi.mocked(fetchJson).mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(patch[0]).toContain('/api/admin/changes')
    expect(JSON.parse(patch[1]!.body as string)).toEqual({ rowIds: [7, 8], hidden: true })
    expect(await screen.findByRole('button', { name: 'Show again: ALDI' })).toBeInTheDocument()
  })
})
