// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CommunityManager from './CommunityManager'
import { mockRouter } from '@/test/nextNavigationMock'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import { adminBase } from '@/lib/adminNav'
import type { Community } from '@/lib/communityStore'

// The "New Community" flow's client-side validation (submit() in
// CommunityManager.tsx) was exercised only by the e2e happy path, which
// never touches the error branches — required fields, lat/lng range, hex
// color shape. Mirrors CategoryEditor.test.tsx's shape/mocking pattern:
// fetchJson/parseOkJson mocked (this component uses parseOkJson directly
// against a raw fetch() for its GET load, and fetchJson for the POST), no
// provider stack needed since this component reads no content/community
// context — only useRouter, for the post-create redirect.

vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

function makeCommunity(overrides: Partial<Community> = {}): Community {
  return {
    slug: 'philly',
    name: 'Philadelphia Jewish Community',
    shortName: 'PJC',
    tagline: 'Guide for residents & visitors',
    mission: 'A guide to Jewish Philadelphia.',
    manifestDescription: 'A guide to Jewish Philadelphia.',
    region: 'Philadelphia',
    timezone: 'America/New_York',
    mapCenter: { lat: 39.95, lng: -75.16 },
    themeColor: '#1d4ed8',
    backgroundColor: '#f8fafc',
    features: {},
    ui: {},
    sortOrder: 0,
    isDefault: true,
    ...overrides,
  }
}

function mockList(communities: Community[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response))
  vi.mocked(parseOkJson).mockResolvedValue({ communities })
}

async function renderAndWaitForList(communities: Community[] = [makeCommunity()]) {
  mockList(communities)
  render(<CommunityManager token="tok" />)
  await screen.findByText('Every community this site hosts.')
}

// Fills every field submit() requires, so a test overriding a single field
// can isolate exactly one validation branch. Deliberately leaves the theme
// and background colors at their (valid) component defaults.
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^name$/i), 'Baltimore Jewish Community')
  await user.type(screen.getByLabelText(/^tagline$/i), 'Guide for residents & visitors')
  await user.type(screen.getByLabelText(/^mission$/i), 'A guide to Jewish Baltimore.')
  await user.type(screen.getByLabelText(/^region$/i), 'Baltimore')
  await user.type(screen.getByLabelText(/map center latitude/i), '39.369')
  await user.type(screen.getByLabelText(/map center longitude/i), '-76.715')
}

beforeEach(() => {
  vi.mocked(fetchJson).mockResolvedValue({ community: makeCommunity({ slug: 'baltimore' }) })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CommunityManager — the community list', () => {
  it('renders every community from GET /api/communities, with "Default" only on the flagged row', async () => {
    await renderAndWaitForList([
      makeCommunity({ slug: 'philly', name: 'Philadelphia', isDefault: true }),
      makeCommunity({ slug: 'ues', name: 'Upper East Side', isDefault: false }),
    ])

    expect(screen.getByText('Philadelphia')).toBeInTheDocument()
    expect(screen.getByText('Upper East Side')).toBeInTheDocument()
    expect(screen.getAllByText('Default')).toHaveLength(1)
  })

  it('links each community to its own admin console', async () => {
    await renderAndWaitForList([makeCommunity({ slug: 'ues', name: 'Upper East Side' })])

    expect(screen.getByRole('link', { name: /upper east side/i })).toHaveAttribute('href', adminBase('ues'))
  })
})

describe('CommunityManager — new community form', () => {
  it('auto-derives the slug from the name, and stops once the slug is edited directly', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList()
    await user.click(screen.getByRole('button', { name: /new community/i }))

    await user.type(screen.getByLabelText(/^name$/i), 'Baltimore Jewish Community')
    expect(screen.getByLabelText(/url slug/i)).toHaveValue('baltimore-jewish-community')

    await user.clear(screen.getByLabelText(/url slug/i))
    await user.type(screen.getByLabelText(/url slug/i), 'bmore')
    await user.type(screen.getByLabelText(/^name$/i), '!')
    // Slug stays exactly what was typed — further name edits no longer touch it.
    expect(screen.getByLabelText(/url slug/i)).toHaveValue('bmore')
  })

  it.each([
    ['name', 'Name is required.'],
    ['tagline', 'Tagline is required.'],
    ['mission', 'Mission is required.'],
    ['region', 'Region is required.'],
  ] as const)('blocks save with "%s" missing', async (_field, message) => {
    const user = userEvent.setup()
    await renderAndWaitForList()
    await user.click(screen.getByRole('button', { name: /new community/i }))

    await fillValidForm(user)
    // Re-clear just the field under test.
    const labelPattern =
      _field === 'name' ? /^name$/i : _field === 'tagline' ? /^tagline$/i : _field === 'mission' ? /^mission$/i : /^region$/i
    await user.clear(screen.getByLabelText(labelPattern))

    await user.click(screen.getByRole('button', { name: /create community/i }))

    expect(screen.getByText(message)).toBeInTheDocument()
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it('blocks save when the slug is cleared', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList()
    await user.click(screen.getByRole('button', { name: /new community/i }))

    await fillValidForm(user)
    await user.clear(screen.getByLabelText(/url slug/i))

    await user.click(screen.getByRole('button', { name: /create community/i }))

    expect(screen.getByText('URL slug is required.')).toBeInTheDocument()
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it('rejects a latitude outside -90..90', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList()
    await user.click(screen.getByRole('button', { name: /new community/i }))

    await fillValidForm(user)
    await user.clear(screen.getByLabelText(/map center latitude/i))
    await user.type(screen.getByLabelText(/map center latitude/i), '200')

    await user.click(screen.getByRole('button', { name: /create community/i }))

    expect(screen.getByText('Map center latitude must be a number between -90 and 90.')).toBeInTheDocument()
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it('rejects a longitude outside -180..180', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList()
    await user.click(screen.getByRole('button', { name: /new community/i }))

    await fillValidForm(user)
    await user.clear(screen.getByLabelText(/map center longitude/i))
    await user.type(screen.getByLabelText(/map center longitude/i), '200')

    await user.click(screen.getByRole('button', { name: /create community/i }))

    expect(screen.getByText('Map center longitude must be a number between -180 and 180.')).toBeInTheDocument()
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it('rejects a malformed brand color', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList()
    await user.click(screen.getByRole('button', { name: /new community/i }))

    await fillValidForm(user)
    await user.clear(screen.getByLabelText(/brand color/i))
    await user.type(screen.getByLabelText(/brand color/i), 'blue')

    await user.click(screen.getByRole('button', { name: /create community/i }))

    expect(screen.getByText('Brand color must be a hex value like #1d4ed8.')).toBeInTheDocument()
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it('rejects a malformed background color', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList()
    await user.click(screen.getByRole('button', { name: /new community/i }))

    await fillValidForm(user)
    await user.clear(screen.getByLabelText(/background color/i))
    await user.type(screen.getByLabelText(/background color/i), 'not-a-color')

    await user.click(screen.getByRole('button', { name: /create community/i }))

    expect(screen.getByText('Background color must be a hex value like #f8fafc.')).toBeInTheDocument()
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it('submits the right JSON shape and navigates to the new community\'s admin console', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList()
    await user.click(screen.getByRole('button', { name: /new community/i }))

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /create community/i }))

    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(adminBase('baltimore')))
    const call = vi.mocked(fetchJson).mock.calls[0]!
    expect(call[0]).toBe('/api/admin/communities')
    const init = call[1] as RequestInit
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({
      slug: 'baltimore-jewish-community',
      name: 'Baltimore Jewish Community',
      tagline: 'Guide for residents & visitors',
      mission: 'A guide to Jewish Baltimore.',
      region: 'Baltimore',
      mapCenter: { lat: 39.369, lng: -76.715 },
      cloneFrom: null,
    })
  })

  it('sends the selected clone source instead of null when "Clone from" is chosen', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList([makeCommunity({ slug: 'philly', name: 'Philadelphia' })])
    await user.click(screen.getByRole('button', { name: /new community/i }))

    await fillValidForm(user)
    await user.selectOptions(screen.getByLabelText(/starting content/i), 'philly')
    await user.click(screen.getByRole('button', { name: /create community/i }))

    await waitFor(() => expect(fetchJson).toHaveBeenCalled())
    const call = vi.mocked(fetchJson).mock.calls[0]!
    const body = JSON.parse((call[1] as RequestInit).body as string)
    expect(body.cloneFrom).toBe('philly')
  })

  it('shows a server-side error inline and does not navigate', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error('"baltimore" is already in use by another community.'))
    const user = userEvent.setup()
    await renderAndWaitForList()
    await user.click(screen.getByRole('button', { name: /new community/i }))

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /create community/i }))

    expect(await screen.findByText('"baltimore" is already in use by another community.')).toBeInTheDocument()
    expect(mockRouter.push).not.toHaveBeenCalled()
    // The form is still there, not swapped back to the list view.
    expect(screen.getByRole('button', { name: /create community/i })).toBeInTheDocument()
  })
})
