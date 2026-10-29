// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import CommunityEditor from './CommunityEditor'

// Settings' Community tab: the name and logo, moved here from Site's Header
// and menus.

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/community',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const SETTINGS = { ...SITE_SETTINGS_DEFAULTS, name: 'Test Directory', logoUrl: 'https://example.com/logo.png', feedbackHeading: 'Old heading' }

async function renderEditor() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response))
  vi.mocked(parseOkJson).mockResolvedValue({ settings: SETTINGS })
  renderWithProviders(<CommunityEditor token="tok" />, { community: { slug: 'philly' } })
  await screen.findByRole('heading', { name: 'Name and logo' })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CommunityEditor', () => {
  it('shows the name, and a logo that can be repositioned', async () => {
    await renderEditor()
    expect(screen.getByLabelText('Name')).toHaveValue('Test Directory')
    expect(screen.getByText('Click the preview to reposition/re-zoom it')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Save' })).toBeNull()
  })

  it('saves the name and logo alone, for this community', async () => {
    const user = userEvent.setup()
    await renderEditor()
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'New Directory')

    vi.mocked(fetchJson).mockResolvedValue({ settings: { ...SETTINGS, name: 'New Directory' } })
    const bar = screen.getByRole('region', { name: 'Save' })
    await user.click(within(bar).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(within(bar).getByText('Saved.')).toBeInTheDocument())

    const [url, init] = vi.mocked(fetchJson).mock.calls[0]!
    expect(url).toBe('/api/admin/site-settings?community=philly')
    expect((init as RequestInit).method).toBe('PATCH')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: 'New Directory', logoUrl: 'https://example.com/logo.png' })
  })

  it('Undo puts the saved name back', async () => {
    const user = userEvent.setup()
    await renderEditor()
    await user.type(screen.getByLabelText('Name'), '!')
    await user.click(within(screen.getByRole('region', { name: 'Save' })).getByRole('button', { name: /Undo/ }))
    expect(screen.getByLabelText('Name')).toHaveValue('Test Directory')
  })
})
