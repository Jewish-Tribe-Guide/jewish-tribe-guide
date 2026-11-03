// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
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
})

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

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(fetchJson).toHaveBeenCalled())
    const body = JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).not.toHaveProperty('mapZoomRadiusMiles')
  })
})

// The eruvim were the admin's Eruvim tab until Oct 22; now they're edited
// here, on the Eruv row, so no category has a tab of its own.
describe('SingletonEditor — the Eruv row holds the eruvim', () => {
  const eruv: AdminEruv = { id: 'center-city', name: 'Center City Eruv', covers: null, website: null, hotline: null, alertsUrl: null, statusUrl: null, statusDated: false, statusEmail: null, statusEmailKept: null, status: null, statusWords: null, statusPostedOn: null, statusCheckedAt: null, statusErrorAt: null, statusError: null, lineUrl: null, rawLine: null, lineReadAt: null, lineError: null, lineLeaveOut: [], lineHidePoints: false, lineMissing: [], lineColor: null, sortOrder: 1, active: true }
  const eruvCategory: CategoryConfig = { id: 'eruv-information', label: 'Eruv', pluralLabel: 'Eruv', icon: '', description: '', detailFields: [], kind: 'eruv' }
  const eruvimCalls = () => vi.mocked(fetchJson).mock.calls.filter(([url]) => String(url).includes('/api/admin/eruvim'))

  beforeEach(() => {
    vi.mocked(fetchJson).mockImplementation(async (url) =>
      String(url).includes('/api/admin/eruvim') ? { ok: true, available: true, timezone: 'America/New_York', eruvim: [eruv] } : { ok: true },
    )
  })

  it('lists each eruv, with Add an eruv, under the card’s own fields', async () => {
    renderWithProviders(<SingletonEditor token="t" category={eruvCategory} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(await screen.findByTestId('admin-eruv')).toHaveTextContent('Center City Eruv')
    expect(screen.getByRole('heading', { name: 'Eruvim' })).toBeInTheDocument()
    expect(screen.getByLabelText('Add an eruv')).toBeInTheDocument()
  })

  it('is on the Eruv row only', () => {
    renderWithProviders(<SingletonEditor token="t" category={zmanimCategory()} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(eruvimCalls()).toHaveLength(0)
    expect(screen.queryByRole('heading', { name: 'Eruvim' })).not.toBeInTheDocument()
  })
})
