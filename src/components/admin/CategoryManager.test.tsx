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
// The page beside a category's settings needs the whole site's providers.
vi.mock('./CategoryPreview', () => ({ default: () => null }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

function show(categories: CategoryConfig[], { editingId = null, onOpenEditor = vi.fn(), placeCounts = {} }: { editingId?: string | null; onOpenEditor?: (id: string) => void; placeCounts?: Record<string, number> } = {}) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({}))
  vi.mocked(parseOkJson).mockResolvedValue({ categories, placeCounts })
  vi.mocked(fetchJson).mockResolvedValue({})
  renderWithProviders(<CategoryManager token="t" editingId={editingId} onOpenEditor={onOpenEditor} onCloseEditor={vi.fn()} />)
}

/** The list's rows, each as its text: name, line, then "Hidden" when off. */
const rows = () =>
  screen
    .getAllByRole('button')
    .filter((b) => b.querySelector('svg') && b.textContent !== '+ New category page')
    .map((b) => b.textContent)

const food = makeCategory({ id: 'restaurant', pluralLabel: 'Food' })
const shul = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
const sukkah = makeCategory({ id: 'childcare', pluralLabel: 'Childcare', active: false })
const map = makeCategory({ id: 'map', kind: 'map', pluralLabel: 'Map', active: true })
const eruv = makeCategory({ id: 'eruv-information', kind: 'eruv', pluralLabel: 'Eruv', active: false })
const medical = makeCategory({ id: 'jewish-medical-resources', kind: 'medical', pluralLabel: 'Jewish Medical Resources', active: true })

describe('CategoryManager', () => {
  // Board 1: one list by name, each row saying its places or what kind of
  // page it is, and Hidden when it's off the site.
  it('lists every page by name with its places, and never Jewish Medical Resources', async () => {
    show([shul, food, sukkah, map, eruv, medical], { placeCounts: { synagogue: 16, restaurant: 1 } })
    await screen.findByText('Synagogues')
    expect(rows()).toEqual([
      'Candle Lighting & ZmanimTimes pageHidden',
      'Childcare0 placesHidden',
      'EruvEruv pageHidden',
      'Food1 place',
      'MapMap page',
      'Synagogues16 places',
    ])
    expect(screen.queryByText('Jewish Medical Resources')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('asks for the places counts', async () => {
    show([shul])
    await screen.findByText('Synagogues')
    expect(String(vi.mocked(fetch).mock.calls[0]![0])).toContain('/api/admin/categories?counts=1')
  })

  it('opens a page from its row', async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    show([shul, map], { onOpenEditor: open })
    await user.click((await screen.findByText('Synagogues')).closest('button')!)
    expect(open).toHaveBeenLastCalledWith('cat:synagogue')
    await user.click(screen.getByText('Map page').closest('button')!)
    expect(open).toHaveBeenLastCalledWith('screen:map')
    await user.click(screen.getByRole('button', { name: '+ New category page' }))
    expect(open).toHaveBeenLastCalledWith('cat:new')
  })

  // A page's own address without the prefix used to fall through to the list.
  it('opens a page from its bare address', async () => {
    show([shul, food], { editingId: 'restaurant' })
    expect(await screen.findByRole('heading', { name: 'Food' })).toBeInTheDocument()
  })

  it('hides the Map from its page, keeping its name and photo', async () => {
    const user = userEvent.setup()
    show([shul, map], { editingId: 'screen:map' })
    await user.click(await screen.findByRole('switch', { name: 'On the site' }))
    await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(1))
    const [url, init] = vi.mocked(fetchJson).mock.calls[0]
    expect(String(url)).toContain('/api/admin/categories/map')
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({ active: false })
  })

  it('makes Candle Lighting’s row the first time it’s switched on', async () => {
    const user = userEvent.setup()
    show([shul, map], { editingId: 'screen:zmanim' })
    const on = await screen.findByRole('switch', { name: 'On the site' })
    expect(on).toHaveAttribute('aria-checked', 'false')
    await user.click(on)
    await waitFor(() => expect(fetchJson).toHaveBeenCalled())
    const [url, init] = vi.mocked(fetchJson).mock.calls[0]
    expect(String(url)).toContain('/api/admin/categories')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toMatchObject({ kind: 'zmanim', pluralLabel: 'Candle Lighting & Zmanim' })
  })

  it('makes the Eruv’s row when it has none and is shown', async () => {
    const user = userEvent.setup()
    show([shul], { editingId: 'screen:eruv' })
    expect(screen.queryByRole('button', { name: 'Delete this page' })).toBeNull()
    await user.click(await screen.findByRole('switch', { name: 'On the site' }))
    await waitFor(() => expect(fetchJson).toHaveBeenCalled())
    const [, init] = vi.mocked(fetchJson).mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toMatchObject({ kind: 'eruv' })
  })

  // The user, Nov 4: "Eruv should be able to be deleted as a category".
  it('deletes the Eruv from its page once it says how many eruvim and watches go with it', async () => {
    const user = userEvent.setup()
    show([shul, eruv], { editingId: 'screen:eruv' })
    // Its eruvim load too; only the count answers with how many go.
    vi.mocked(fetchJson).mockImplementation(async (url) => (String(url).includes('dry=1') ? { ok: true, listings: 0, eruvim: 4, watches: 1 } : {}))
    const deletes = () => vi.mocked(fetchJson).mock.calls.filter(([, init]) => init?.method === 'DELETE')
    await user.click(await screen.findByRole('button', { name: 'Delete this page' }))
    expect(await screen.findByText(/its 4 eruvim and 1 website watch\?/)).toBeTruthy()
    expect(String(deletes()[0]![0])).toContain('/api/admin/categories/eruv-information?dry=1')
    await user.click(screen.getByRole('button', { name: 'Delete it' }))
    await waitFor(() => expect(deletes()).toHaveLength(2))
    expect(String(deletes()[1]![0])).toMatch(/\/api\/admin\/categories\/eruv-information(\?community=[^&]*)?$/)
  })
})
