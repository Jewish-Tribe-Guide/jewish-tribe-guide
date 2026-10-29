// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { fetchJson } from '@/lib/fetchJson'
import type { CampaignBanner } from '@/lib/campaignBanner'
import CampaignBannerManager, { dateRange } from './CampaignBannerManager'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/campaigns',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/fetchJson')>()), fetchJson: vi.fn() }))

const year = new Date().getFullYear()
const sukkot: CampaignBanner = {
  id: 'b1',
  categoryId: 'sukkahs',
  title: 'Sukkah Map',
  subtitle: 'Find open sukkahs',
  startDate: `${year}-10-01`,
  endDate: `${year}-10-10`,
  destination: 'map',
}
const always: CampaignBanner = { ...sukkot, id: 'b2', title: 'Always on', startDate: '2000-01-01', endDate: '2999-12-31' }
const categories = [makeCategory({ id: 'sukkahs', pluralLabel: 'Sukkahs', active: false }), makeCategory({ id: 'food', pluralLabel: 'Food' })]

function renderCampaigns(openId: string | null, banners = [sukkot, always]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('campaign') ? { ok: true, banners } : { ok: true, categories }), { status: 200 })),
  )
  vi.mocked(fetchJson).mockResolvedValue({ ok: true })
  const onOpen = vi.fn()
  const onClose = vi.fn()
  renderWithProviders(<CampaignBannerManager token="tok" openId={openId} onOpen={onOpen} onClose={onClose} />, { community: { slug: 'philly' } })
  return { onOpen, onClose }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('Campaigns', () => {
  it('lists each campaign with what it opens and when, and which is on now', async () => {
    const user = userEvent.setup()
    const { onOpen } = renderCampaigns(null)
    const row = await screen.findByRole('button', { name: /Sukkah Map/ })
    expect(row).toHaveTextContent('Sukkahs (hidden) · Oct 1 – Oct 10')
    expect(screen.getByRole('button', { name: /Always on/ })).toHaveTextContent('On now')
    expect(row).not.toHaveTextContent('On now')
    await user.click(row)
    expect(onOpen).toHaveBeenCalledWith('b1')
    await user.click(screen.getByRole('button', { name: '+ Add a campaign' }))
    expect(onOpen).toHaveBeenCalledWith('new')
  })

  it('makes a new one: Not saved until Save, which sends it and goes back', async () => {
    const user = userEvent.setup()
    const { onClose } = renderCampaigns('new')
    expect(await screen.findByRole('heading', { name: 'New campaign' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Not saved')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Give it a title.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Title'), 'Chanukah')
    await user.selectOptions(screen.getByLabelText('Opens'), 'food')
    await user.type(screen.getByLabelText('Starts'), `${year}-12-14`)
    await user.type(screen.getByLabelText('Ends'), `${year}-12-22`)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/admin/campaign-banners?community=philly',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ categoryId: 'food', title: 'Chanukah', subtitle: '', startDate: `${year}-12-14`, endDate: `${year}-12-22`, destination: 'map' }) }),
      'Could not save the campaign.',
    )
  })

  it('edits one through the Save bar, and deletes it after asking once', async () => {
    const user = userEvent.setup()
    const { onClose } = renderCampaigns('b1')
    const title = await screen.findByLabelText('Title')
    expect(screen.getByRole('heading', { name: 'Sukkah Map' })).toBeInTheDocument()
    await user.type(title, ' 2')
    expect(screen.getByRole('status')).toHaveTextContent('1 change')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(title).toHaveValue('Sukkah Map')

    await user.click(screen.getByRole('button', { name: 'Delete this campaign' }))
    await user.click(screen.getByRole('button', { name: 'Leave it' }))
    expect(fetchJson).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Delete this campaign' }))
    await user.click(screen.getByRole('button', { name: 'Delete it' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(fetchJson).toHaveBeenCalledWith('/api/admin/campaign-banners/b1?community=philly', expect.objectContaining({ method: 'DELETE' }), 'Could not delete the campaign.')
  })

  it('writes a date range short, with the year only when it isn’t this one', () => {
    expect(dateRange(`${year}-10-01`, `${year}-10-10`)).toBe('Oct 1 – Oct 10')
    expect(dateRange('2020-10-01', '2020-10-10')).toBe('Oct 1, 2020 – Oct 10, 2020')
  })
})
