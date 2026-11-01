// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
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

const shul = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
const map = makeCategory({ id: 'map', kind: 'map', pluralLabel: 'Map', active: true })
const eruv = makeCategory({ id: 'eruv-information', kind: 'eruv', pluralLabel: 'Eruv', active: false })
const medical = makeCategory({ id: 'jewish-medical-resources', kind: 'medical', pluralLabel: 'Jewish Medical Resources', active: true })

describe('CategoryManager', () => {
  it('lists only what holds places, with the rest as switches, and never Jewish Medical Resources', async () => {
    show([shul, map, eruv, medical])
    await screen.findByText('Synagogues')
    expect(screen.getAllByRole('switch').map((s) => [s.getAttribute('aria-label'), s.getAttribute('aria-checked')])).toEqual([
      ['Map', 'true'],
      ['Candle Lighting & Zmanim', 'false'],
      ['Eruv', 'false'],
    ])
    expect(screen.queryByText('Jewish Medical Resources')).toBeNull()
    // Only one row has category buttons.
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1)
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

  it('hides the row when switched off, and shows it again, keeping its name and photo', async () => {
    const user = userEvent.setup()
    show([shul, map, eruv])
    await user.click(await screen.findByRole('switch', { name: 'Map' }))
    await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(1))
    let [url, init] = vi.mocked(fetchJson).mock.calls[0]
    expect(String(url)).toContain('/api/admin/categories/map')
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({ active: false })
    await waitFor(() => expect(parseOkJson).toHaveBeenCalledTimes(2))
    await user.click(screen.getByRole('switch', { name: 'Eruv' }))
    await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(2))
    ;[url, init] = vi.mocked(fetchJson).mock.calls[1]
    expect(String(url)).toContain('/api/admin/categories/eruv-information')
    expect(JSON.parse(String(init?.body))).toEqual({ active: true })
  })

  // The Eruv's own screen holds its eruvim, so it has to stay reachable.
  it('opens a screen’s own page from its name, off or on', async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    show([shul, eruv], open)
    await user.click(await screen.findByRole('button', { name: 'Eruv' }))
    expect(open).toHaveBeenCalledWith('cat:eruv-information')
  })
})
