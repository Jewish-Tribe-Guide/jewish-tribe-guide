// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SingletonEditor } from './CategoryManager'
import { fetchJson } from '@/lib/fetchJson'
import type { CategoryConfig } from '@/lib/categories'

// SingletonEditor is the fixed, code-driven card editor for Map/Zmanim/Eruv/
// Jewish Medical Resources (see CATEGORY_MANAGER's SINGLETON_EDITABLE_KINDS)
// — name/icon/background only, except the Map zoom radius, which lives here
// specifically because it's a Map-only concern. Exported from
// CategoryManager.tsx purely so this can render it directly, same reasoning
// CategoryEditor.test.tsx gives for testing that sibling editor standalone.

vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn() }))

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

describe('SingletonEditor — Map zoom radius', () => {
  it('shows the zoom radius field, blank when unset, only for the Map category', () => {
    render(<SingletonEditor token="t" category={mapCategory()} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('spinbutton')).toHaveValue(null)
  })

  it('does not show the field for a non-Map singleton (e.g. Zmanim)', () => {
    render(<SingletonEditor token="t" category={zmanimCategory()} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  })

  it('pre-fills the current value when already set', () => {
    render(<SingletonEditor token="t" category={mapCategory({ mapZoomRadiusMiles: 10 })} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('spinbutton')).toHaveValue(10)
  })

  it('saving sends the entered number in the PATCH body, for Map only', async () => {
    const user = userEvent.setup()
    render(<SingletonEditor token="t" category={mapCategory()} onSaved={vi.fn()} onCancel={vi.fn()} />)

    await user.type(screen.getByRole('spinbutton'), '10')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(fetchJson).toHaveBeenCalled())
    const body = JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string)
    expect(body.mapZoomRadiusMiles).toBe(10)
  })

  it('blanking the field back out sends null, not an empty string or NaN', async () => {
    const user = userEvent.setup()
    render(<SingletonEditor token="t" category={mapCategory({ mapZoomRadiusMiles: 10 })} onSaved={vi.fn()} onCancel={vi.fn()} />)

    await user.clear(screen.getByRole('spinbutton'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(fetchJson).toHaveBeenCalled())
    const body = JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string)
    expect(body.mapZoomRadiusMiles).toBeNull()
  })

  it('never sends mapZoomRadiusMiles for a non-Map singleton', async () => {
    const user = userEvent.setup()
    render(<SingletonEditor token="t" category={zmanimCategory()} onSaved={vi.fn()} onCancel={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(fetchJson).toHaveBeenCalled())
    const body = JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).not.toHaveProperty('mapZoomRadiusMiles')
  })
})
