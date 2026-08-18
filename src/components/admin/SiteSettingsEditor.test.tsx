// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeCommunity } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import type { HomeSection } from '@/lib/homeSections'
import SiteSettingsEditor from './SiteSettingsEditor'

// SiteSettingsEditor loads its own draft over the network (settings +
// sections, independent of ContentProvider's server-loaded content) rather
// than reading useSiteSettings/useHomeSections — so this mocks fetchJson/
// parseOkJson the same way ModerationQueue.test.tsx does, plus stubs
// DevicePreviewFrame (an iframe/postMessage-heavy component with its own
// separate concerns) and writePreviewDraft (a sessionStorage write, not
// worth asserting on here).

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))
vi.mock('@/lib/previewDraft', () => ({
  previewUrl: () => 'https://example.com/preview',
  writePreviewDraft: vi.fn(),
}))
vi.mock('./DevicePreviewFrame', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div>
      <p>DevicePreviewFrame</p>
      <button onClick={onClose}>Close preview</button>
    </div>
  ),
}))

function fakeResponse(): Response {
  return { ok: true, status: 200 } as Response
}

function mockLoad(settings: typeof SITE_SETTINGS_DEFAULTS, sections: HomeSection[] = []) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse()))
  vi.mocked(parseOkJson).mockImplementation(() => {
    // The two calls race via Promise.all — settings first, sections second,
    // in the order load() awaits them — but parseOkJson can't tell which
    // response is which from the stubbed Response alone, so key off call order.
    const call = vi.mocked(parseOkJson).mock.calls.length
    return Promise.resolve(call === 1 ? { settings } : { sections })
  })
}

async function renderEditor(section: 'site' | 'home', settings = SITE_SETTINGS_DEFAULTS, sections: HomeSection[] = []) {
  mockLoad(settings, sections)
  const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
  renderWithProviders(<SiteSettingsEditor token="tok" section={section} />, {
    content: { categories: [grocery] },
    community: makeCommunity({ slug: 'philly' }),
  })
  // "Save changes" always renders once the draft has loaded, regardless of
  // which tab — the Site tab's own name field (used as the loaded-signal
  // everywhere else) doesn't exist on the "home" tab.
  await screen.findByRole('button', { name: 'Save changes' })
}

beforeEach(() => {
  vi.mocked(fetchJson).mockResolvedValue({ ok: true })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('SiteSettingsEditor — the Site tab', () => {
  it('loads and shows the current branding fields', async () => {
    await renderEditor('site', { ...SITE_SETTINGS_DEFAULTS, name: 'Test Directory', tagline: 'Find what you need' })

    expect(screen.getByDisplayValue('Test Directory')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Find what you need')).toBeInTheDocument()
  })

  it('Save/Cancel start disabled, and editing a field enables them', async () => {
    await renderEditor('site')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Cancel$/ })).toBeDisabled()

    const user = userEvent.setup()
    await user.type(screen.getByDisplayValue(SITE_SETTINGS_DEFAULTS.tagline), '!')

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })

  it('Cancel reverts an edited field back to the loaded value', async () => {
    const user = userEvent.setup()
    await renderEditor('site', { ...SITE_SETTINGS_DEFAULTS, name: 'Original Name' })

    const nameInput = screen.getByDisplayValue('Original Name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Changed Name')
    await user.click(screen.getByRole('button', { name: /^Cancel$/ }))

    expect(screen.getByDisplayValue('Original Name')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Changed Name')).not.toBeInTheDocument()
  })

  it('Save sends only the settings PATCH when only settings changed, and shows a saved notice', async () => {
    const user = userEvent.setup()
    await renderEditor('site', { ...SITE_SETTINGS_DEFAULTS, name: 'Original Name' })

    const nameInput = screen.getByDisplayValue('Original Name')
    await user.clear(nameInput)
    await user.type(nameInput, 'New Name')
    // The real PATCH endpoint echoes back the saved settings, which the
    // component re-derives its draft from — a bare { ok: true } leaves
    // `draft` undefined and the whole screen reverts to "Loading…".
    vi.mocked(fetchJson).mockResolvedValue({ settings: { ...SITE_SETTINGS_DEFAULTS, name: 'New Name' } })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.getByText('Saved.')).toBeInTheDocument())
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/admin/site-settings',
      expect.objectContaining({ method: 'PATCH', headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
      'Save failed.',
    )
    const body = JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string)
    expect(body.name).toBe('New Name')
  })

  it('toggling feedback off hides the feedback sub-fields', async () => {
    const user = userEvent.setup()
    await renderEditor('site', { ...SITE_SETTINGS_DEFAULTS, feedbackEnabled: true })

    expect(screen.getByDisplayValue(SITE_SETTINGS_DEFAULTS.feedbackButtonLabel)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Enabled' }))

    expect(screen.queryByDisplayValue(SITE_SETTINGS_DEFAULTS.feedbackButtonLabel)).not.toBeInTheDocument()
  })

  it('opens and closes the device preview', async () => {
    const user = userEvent.setup()
    await renderEditor('site')

    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByText('DevicePreviewFrame')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close preview' }))
    expect(screen.queryByText('DevicePreviewFrame')).not.toBeInTheDocument()
  })

  // Regression test: real trackpad/browser Back used to do nothing while the
  // preview was open — opening it never pushed a history entry, so there was
  // nothing for Back to land on. A popstate (what a real Back gesture fires)
  // should now close the overlay, the same as clicking "Close preview".
  it('closes the preview on a real browser/trackpad Back (a popstate event), not just the button', async () => {
    const user = userEvent.setup()
    await renderEditor('site')

    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByText('DevicePreviewFrame')).toBeInTheDocument()

    window.dispatchEvent(new PopStateEvent('popstate'))

    await waitFor(() => expect(screen.queryByText('DevicePreviewFrame')).not.toBeInTheDocument())
  })

  it('a popstate before the preview is even open does nothing (no listener registered yet)', async () => {
    await renderEditor('site')

    expect(() => window.dispatchEvent(new PopStateEvent('popstate'))).not.toThrow()
    expect(screen.queryByText('DevicePreviewFrame')).not.toBeInTheDocument()
  })
})

describe('SiteSettingsEditor — the Desktop & mobile tab', () => {
  it('shows the featured-cards picker on desktop by default', async () => {
    await renderEditor('home')
    expect(screen.getByText('Featured cards')).toBeInTheDocument()
    expect(screen.getByText('Slot 1')).toBeInTheDocument()
  })

  it('switches to the mobile tab bar editor when Mobile is selected', async () => {
    const user = userEvent.setup()
    await renderEditor('home')

    await user.click(screen.getByRole('button', { name: /Mobile/ }))

    expect(screen.getByText('Mobile tab bar')).toBeInTheDocument()
    expect(screen.queryByText('Featured cards')).not.toBeInTheDocument()
  })
})
