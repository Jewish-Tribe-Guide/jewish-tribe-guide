// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCommunity } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { parseOkJson } from '@/lib/fetchJson'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import FeedbackEditor from './FeedbackEditor'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/forms',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('FeedbackEditor', () => {
  // Supabase hands the page a new token about once an hour; loading again
  // on it put the saved words back over what was typed (Nov 18 review).
  it('keeps what was typed when the sign-in token changes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
    vi.mocked(parseOkJson).mockResolvedValue({ settings: SITE_SETTINGS_DEFAULTS })
    const user = userEvent.setup()
    const view = renderWithProviders(<FeedbackEditor token="tok" onBack={() => {}} />, { community: makeCommunity({ slug: 'philly' }) })
    const heading = await screen.findByLabelText('Heading')
    await user.type(heading, '!')
    view.rerenderWithProviders(<FeedbackEditor token="tok-2" onBack={() => {}} />)
    await act(async () => {})
    expect(screen.getByLabelText('Heading')).toHaveValue(`${SITE_SETTINGS_DEFAULTS.feedbackHeading}!`)
    expect(within(screen.getByRole('region', { name: 'Save' })).getByText('1 change')).toBeInTheDocument()
  })
})
