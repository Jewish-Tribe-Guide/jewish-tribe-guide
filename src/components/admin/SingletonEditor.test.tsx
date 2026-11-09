// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SingletonEditor } from './CategoryManager'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { fetchJson } from '@/lib/fetchJson'
import type { CategoryConfig } from '@/lib/categories'
import type { AdminEruv } from '@/lib/eruvStore'

// SingletonEditor is the fixed, code-driven card editor — name/icon/background
// only. Since Nov 3 only the Eruv opens it from the list. Exported from
// CategoryManager.tsx purely so this can render it directly, same reasoning
// CategoryEditor.test.tsx gives for testing that sibling editor standalone.

vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

function mapCategory(overrides: Partial<CategoryConfig> = {}): CategoryConfig {
  return {
    id: 'map',
    label: 'Map',
    pluralLabel: 'Map',
    icon: '🗺️',
    description: '',
    detailFields: [],
    kind: 'map',
    mapZoomRadiusMiles: null,
    ...overrides,
  }
}

function zmanimCategory(overrides: Partial<CategoryConfig> = {}): CategoryConfig {
  return {
    id: 'zmanim',
    label: 'Zmanim',
    pluralLabel: 'Zmanim',
    icon: '🕯️',
    description: '',
    detailFields: [],
    kind: 'zmanim',
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(fetchJson).mockResolvedValue({ ok: true })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

/** No room for the page beside: a phone, or a narrow window. */
const phone = () => vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
const computer = () => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))

// The Map's zoom radius is set once and stays as stored (Nov 3): the Map is
// a switch on the list with nothing to open, and an old link to its editor
// neither shows the field nor sends it, so a save can't blank it.
describe('SingletonEditor — the Map keeps its zoom radius', () => {
  it('has no zoom radius field', () => {
    renderWithProviders(<SingletonEditor token="t" category={mapCategory({ mapZoomRadiusMiles: 10 })} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  })

  it('never sends mapZoomRadiusMiles, so the stored one stays', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SingletonEditor token="t" category={mapCategory({ mapZoomRadiusMiles: 10 })} onSaved={vi.fn()} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Name'), 's')
    await user.click(within(screen.getByRole('region', { name: 'Save' })).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(fetchJson).toHaveBeenCalled())
    const body = JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).not.toHaveProperty('mapZoomRadiusMiles')
  })
})

// The eruvim were the admin's Eruvim tab until Oct 22, then a second
// editor on this page; since Nov 9 they're only in Places, like any listing.
// The page counts them there, as a category page counts its places.
describe('SingletonEditor — the Eruv page', () => {
  const eruv = (id: string, active: boolean): AdminEruv => ({ id, name: id, covers: null, website: null, hotline: null, alertsUrl: null, statusUrl: null, statusDated: false, statusEmail: null, statusEmailKept: null, status: null, statusWords: null, statusPostedOn: null, statusCheckedAt: null, statusErrorAt: null, statusError: null, statusEmailed: false, lineUrl: null, rawLine: null, lineReadAt: null, lineError: null, lineLeaveOut: [], lineHidePoints: false, lineMissing: [], active })
  const eruvCategory: CategoryConfig = { id: 'eruv-information', label: 'Eruv', pluralLabel: 'Eruv', icon: '', description: '', detailFields: [], kind: 'eruv' }
  const eruvimCalls = () => vi.mocked(fetchJson).mock.calls.filter(([url]) => String(url).includes('/api/admin/eruvim'))

  beforeEach(() => {
    vi.mocked(fetchJson).mockImplementation(async (url) =>
      String(url).includes('/api/admin/eruvim') ? { ok: true, available: true, timezone: 'America/New_York', eruvim: [eruv('center-city', true), eruv('old', false)] } : { ok: true },
    )
  })

  it('lists no eruvim, and counts the ones on the site, opening them in Places', async () => {
    renderWithProviders(<SingletonEditor token="t" category={eruvCategory} onToggleActive={vi.fn()} onSaved={vi.fn()} onCancel={vi.fn()} />)
    const link = await screen.findByRole('link', { name: '1 place' })
    expect(link.getAttribute('href')).toMatch(/\/admin\/places\?category=eruv-information$/)
    expect(screen.queryByTestId('admin-eruv')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Add an eruv')).not.toBeInTheDocument()
    expect(screen.queryByText(/Line colour|Order/)).not.toBeInTheDocument()
  })

  it('its preview is an address written through the router, never history.pushState', async () => {
    phone()
    const pushState = vi.spyOn(window.history, 'pushState')
    const user = userEvent.setup()
    renderWithProviders(<SingletonEditor token="t" category={eruvCategory} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(expect.stringMatching(/[?&]preview=1/), expect.anything()))
    expect(pushState).not.toHaveBeenCalled()
    pushState.mockRestore()
  })

  // Nov 9, the user: "make sure that eruv category page is using the same
  // formatting as other category pages". Until then it had its own boxed
  // Name/Icon/Banner fields and Preview/Save/Cancel buttons.
  it('is laid out as a category page: Basics, the page beside, and the save bar', async () => {
    computer()
    const user = userEvent.setup()
    renderWithProviders(<SingletonEditor token="t" category={eruvCategory} onToggleActive={vi.fn()} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Basics' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change the icon' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Preview' })).toBeInTheDocument()
    // No buttons of its own: the save bar appears once something changed.
    expect(screen.queryByRole('button', { name: /^(Save|Cancel|Preview)$/ })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Name'), ' guide')
    const bar = screen.getByRole('region', { name: 'Save' })
    expect(bar).toHaveTextContent('1 change')
    await user.click(within(bar).getByRole('button', { name: 'Undo' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Eruv')
    expect(screen.queryByRole('region', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('on a phone, opens the page with Preview instead of showing it beside', () => {
    phone()
    renderWithProviders(<SingletonEditor token="t" category={eruvCategory} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole('complementary', { name: 'Preview' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument()
  })

  it('is on the Eruv page only', () => {
    renderWithProviders(<SingletonEditor token="t" category={zmanimCategory()} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(eruvimCalls()).toHaveLength(0)
  })
})
