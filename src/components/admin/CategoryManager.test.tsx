// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { makeCategory } from '@/test/providerFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import type { CategoryConfig } from '@/lib/categories'
import CategoryManager from './CategoryManager'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/categories',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

function show(categories: CategoryConfig[], onOpenEditor = vi.fn()) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({}))
  vi.mocked(parseOkJson).mockResolvedValue({ categories })
  vi.mocked(fetchJson).mockResolvedValue({})
  renderWithProviders(<CategoryManager token="t" editingId={null} onOpenEditor={onOpenEditor} onCloseEditor={vi.fn()} />)
}

const food = makeCategory({ id: 'food', pluralLabel: 'Food' })
const shul = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
const map = makeCategory({ id: 'map', kind: 'map', pluralLabel: 'Map', active: true })
const eruv = makeCategory({ id: 'eruv-information', kind: 'eruv', pluralLabel: 'Eruv', active: false })
const medical = makeCategory({ id: 'jewish-medical-resources', kind: 'medical', pluralLabel: 'Jewish Medical Resources', active: true })

describe('CategoryManager', () => {
  it('switches the Map and Candle Lighting up top, and never lists Jewish Medical Resources', async () => {
    show([shul, map, eruv, medical])
    await screen.findByText('Synagogues')
    expect(screen.getAllByRole('switch').map((s) => [s.getAttribute('aria-label'), s.getAttribute('aria-checked')])).toEqual([
      ['Map', 'true'],
      ['Candle Lighting & Zmanim', 'false'],
    ])
    expect(screen.queryByText('Jewish Medical Resources')).toBeNull()
  })

  // Nothing on either is worth changing (Nov 3), so neither opens.
  it('gives the Map and Candle Lighting nothing to open', async () => {
    show([shul, map, eruv])
    await screen.findByText('Synagogues')
    expect(screen.queryByRole('button', { name: /^Map/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Candle Lighting/ })).toBeNull()
  })

  it('makes the row the first time it’s switched on', async () => {
    const user = userEvent.setup()
    show([shul, map])
    await user.click(await screen.findByRole('switch', { name: 'Candle Lighting & Zmanim' }))
    await waitFor(() => expect(fetchJson).toHaveBeenCalled())
    const [url, init] = vi.mocked(fetchJson).mock.calls[0]
    expect(String(url)).toContain('/api/admin/categories')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toMatchObject({ kind: 'zmanim', pluralLabel: 'Candle Lighting & Zmanim' })
  })

  it('hides the row when switched off, keeping its name and photo', async () => {
    const user = userEvent.setup()
    show([shul, map, eruv])
    await user.click(await screen.findByRole('switch', { name: 'Map' }))
    await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(1))
    const [url, init] = vi.mocked(fetchJson).mock.calls[0]
    expect(String(url)).toContain('/api/admin/categories/map')
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({ active: false })
  })

  // Places are added from Places (Nov 3), which offers hidden categories too.
  it('adds no places from a category’s row', async () => {
    show([shul, food, eruv])
    await screen.findByText('Synagogues')
    expect(screen.queryByRole('button', { name: /Add listing/ })).toBeNull()
    expect(within(screen.getByTestId('category-row-synagogue')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Visible', 'Edit', 'Delete'])
  })

  // The Eruv's screen holds its eruvim and their maps, so it sits with the
  // categories (Nov 3): in name order, shown or hidden, and Edit opens it.
  it('lists the Eruv among the categories, in name order', async () => {
    show([shul, food, map, eruv])
    await screen.findByText('Synagogues')
    const rows = screen.getAllByTestId(/^category-row-/).map((r) => r.getAttribute('data-testid'))
    expect(rows).toEqual(['category-row-eruv', 'category-row-food', 'category-row-synagogue'])
  })

  it('shows the Eruv from its row, and Edit opens its page', async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    show([shul, eruv], open)
    const row = await screen.findByTestId('category-row-eruv')
    await user.click(within(row).getByRole('button', { name: 'Hidden' }))
    await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(1))
    const [url, init] = vi.mocked(fetchJson).mock.calls[0]
    expect(String(url)).toContain('/api/admin/categories/eruv-information')
    expect(JSON.parse(String(init?.body))).toEqual({ active: true })
    await user.click(within(row).getByRole('button', { name: 'Edit' }))
    expect(open).toHaveBeenCalledWith('cat:eruv-information')
  })

  it('makes the Eruv’s row when it has none and is shown', async () => {
    const user = userEvent.setup()
    show([shul])
    const row = await screen.findByTestId('category-row-eruv')
    expect(within(row).queryByRole('button', { name: 'Edit' })).toBeNull()
    await user.click(within(row).getByRole('button', { name: 'Hidden' }))
    await waitFor(() => expect(fetchJson).toHaveBeenCalled())
    const [, init] = vi.mocked(fetchJson).mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toMatchObject({ kind: 'eruv' })
  })
})
