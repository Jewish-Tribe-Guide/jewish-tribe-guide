// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
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
    visible: true,
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
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('CommunityManager — the community list', () => {
  it('renders every community from GET /api/admin/communities, with "Default" only on the flagged row', async () => {
    await renderAndWaitForList([
      makeCommunity({ slug: 'philly', name: 'Philadelphia', isDefault: true }),
      makeCommunity({ slug: 'ues', name: 'Upper East Side', isDefault: false }),
    ])

    expect(screen.getByText('Philadelphia')).toBeInTheDocument()
    expect(screen.getByText('Upper East Side')).toBeInTheDocument()
    expect(screen.getAllByText('Default')).toHaveLength(1)
    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      '/api/admin/communities',
      expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
    )
  })

  it('links each community to its own admin console', async () => {
    await renderAndWaitForList([makeCommunity({ slug: 'ues', name: 'Upper East Side' })])

    expect(screen.getByRole('link', { name: /upper east side/i })).toHaveAttribute('href', adminBase('ues'))
  })

  // This is what actually removes the "browse into another community's
  // console" capability for a regular per-community admin: GET
  // /api/admin/communities is superadmin-gated (unlike the public
  // /api/communities this used to call), so a 401 here means a plain
  // access-denied message instead of the list-of-communities-with-links.
  it('shows an access-denied message instead of the list when the endpoint 401s', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response))
    render(<CommunityManager token="tok" />)

    expect(
      await screen.findByText('Only the site owner can create or browse other communities.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Every community this site hosts.')).not.toBeInTheDocument()
    expect(parseOkJson).not.toHaveBeenCalled()
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

describe('CommunityManager — deleting a community', () => {
  const philly = makeCommunity({ slug: 'philly', name: 'Philadelphia', isDefault: true })
  // region overridden — makeCommunity defaults it to 'Philadelphia', which
  // would otherwise make this row's own link text ("/ues · Philadelphia")
  // match a `/philadelphia/i` query meant for the philly row alone.
  const ues = makeCommunity({ slug: 'ues', name: 'Upper East Side', region: 'Manhattan', isDefault: false })

  // The delete button is a sibling of the community's own admin-console
  // link, not nested under it — parentElement is the shared row container
  // for both, which is what `within` needs to scope to just this row.
  function rowFor(name: RegExp): HTMLElement {
    return screen.getByRole('link', { name }).parentElement!
  }

  it('offers no delete option for the default community', async () => {
    await renderAndWaitForList([philly, ues])

    // There IS a "Delete" button on the page (Upper East Side's) — just not
    // attached to the default community's own row.
    expect(within(rowFor(/philadelphia/i)).queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('offers a delete option for a non-default community', async () => {
    await renderAndWaitForList([philly, ues])
    expect(within(rowFor(/upper east side/i)).getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })

  it('requires retyping the exact slug before "Delete forever" is enabled', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList([philly, ues])

    await user.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(
      // A function matcher, not a string/regex — the warning text is split
      // across a plain text node and a nested <span> (the bolded name), so
      // no single text node contains the whole sentence for RTL's default
      // per-text-node matching to find.
      screen.getByText(
        (_content, el) =>
          el?.tagName === 'P' &&
          /permanently deletes[\s\S]*Upper East Side[\s\S]*every listing, category, form, and submission/.test(
            el.textContent ?? '',
          ),
      ),
    ).toBeInTheDocument()

    const deleteForeverButton = screen.getByRole('button', { name: /delete forever/i })
    expect(deleteForeverButton).toBeDisabled()

    const confirmInput = screen.getByLabelText(/type.*to confirm/i)
    await user.type(confirmInput, 'wrong-slug')
    expect(deleteForeverButton).toBeDisabled()

    await user.clear(confirmInput)
    await user.type(confirmInput, 'ues')
    expect(deleteForeverButton).toBeEnabled()
  })

  it('Cancel backs out of the confirmation without deleting', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList([philly, ues])

    await user.click(screen.getByRole('button', { name: /^delete$/i }))
    await user.type(screen.getByLabelText(/type.*to confirm/i), 'ues')
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(screen.queryByText(/permanently deletes/i)).not.toBeInTheDocument()
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it('sends the confirmed slug to DELETE /api/admin/communities/:slug and does a full reload on success', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList([philly, ues])
    vi.mocked(fetchJson).mockResolvedValueOnce({ ok: true })
    await user.click(screen.getByRole('button', { name: /^delete$/i }))
    await user.type(screen.getByLabelText(/type.*to confirm/i), 'ues')
    await user.click(screen.getByRole('button', { name: /delete forever/i }))

    // The success path calls window.location.reload() (see confirmDelete's
    // own comment on why: a real, full reload, not a soft re-fetch — jsdom
    // doesn't support stubbing location.reload directly, so this waits for
    // the DELETE call it's meant to prove happened first) rather than
    // asserting the reload call itself.
    await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(1))
    const call = vi.mocked(fetchJson).mock.calls[0]!
    expect(call[0]).toBe('/api/admin/communities/ues')
    const init = call[1] as RequestInit
    expect(init.method).toBe('DELETE')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body as string)).toEqual({ confirmSlug: 'ues' })
  })

  it('shows a server-side error inline and leaves the community in the list', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error('The default community cannot be deleted.'))
    const user = userEvent.setup()
    await renderAndWaitForList([philly, ues])

    await user.click(screen.getByRole('button', { name: /^delete$/i }))
    await user.type(screen.getByLabelText(/type.*to confirm/i), 'ues')
    await user.click(screen.getByRole('button', { name: /delete forever/i }))

    expect(await screen.findByText('The default community cannot be deleted.')).toBeInTheDocument()
    // Still in the list — scoped past the confirmation panel's own repeat
    // of the name, which is still open since the delete failed.
    expect(within(rowFor(/upper east side/i)).getByText('Upper East Side')).toBeInTheDocument()
  })

  // The real production safety net — see /api/admin/communities/[slug]/route.ts's
  // own VERCEL_ENV check. This proves the client-side half: the button
  // doesn't even render against the real deployment, rather than existing
  // only to fail with a 403 when clicked.
  it('hides every delete button when NEXT_PUBLIC_VERCEL_ENV is production', async () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    await renderAndWaitForList([philly, ues])

    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
    expect(screen.getByText(/deleting a community isn.t available in production/i)).toBeInTheDocument()
  })
})

describe('CommunityManager — the hidden-community preview link', () => {
  function stubClipboard(writeText: (text: string) => Promise<void>) {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  }

  afterEach(() => {
    delete (navigator as { clipboard?: unknown }).clipboard
  })

  const philly = makeCommunity({ slug: 'philly', name: 'Philadelphia', isDefault: true, visible: true })
  const ues = {
    ...makeCommunity({ slug: 'ues', name: 'Upper East Side', region: 'Manhattan', isDefault: false, visible: false }),
    previewToken: 'super-secret-token',
  }

  it('shows no preview link for a visible community', async () => {
    await renderAndWaitForList([philly, { ...ues, visible: true }])
    expect(screen.queryByDisplayValue(/access=/)).not.toBeInTheDocument()
  })

  it('shows the ?access= link for a hidden community', async () => {
    await renderAndWaitForList([philly, ues])
    const input = screen.getByDisplayValue(/\/ues\?access=super-secret-token$/) as HTMLInputElement
    expect(input).toHaveAttribute('readOnly')
  })

  it('copies the link and shows confirmation on click', async () => {
    // userEvent.setup() installs its own clipboard stub (for its paste/copy
    // simulation), so stubClipboard has to run AFTER it or user-event's
    // stub silently wins — same trap useShareLink.test.tsx avoids by using
    // fireEvent instead of userEvent for its clipboard tests.
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    await renderAndWaitForList([philly, ues])

    await user.click(screen.getByRole('button', { name: /copy link/i }))

    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/ues\?access=super-secret-token$/))
    expect(await screen.findByRole('button', { name: /copied!/i })).toBeInTheDocument()
  })
})

describe('CommunityManager — publishing a community', () => {
  const philly = makeCommunity({ slug: 'philly', name: 'Philadelphia', isDefault: true, visible: true })
  const ues = makeCommunity({ slug: 'ues', name: 'Upper East Side', region: 'Manhattan', isDefault: false, visible: false })

  function rowFor(name: RegExp): HTMLElement {
    return screen.getByRole('link', { name }).parentElement!
  }

  it('labels a visible community "Live" and a hidden one "Hidden"', async () => {
    await renderAndWaitForList([philly, ues])

    expect(within(rowFor(/philadelphia/i)).getByText('Live')).toBeInTheDocument()
    expect(within(rowFor(/upper east side/i)).getByText('Hidden')).toBeInTheDocument()
  })

  it('shows the still-reachable-by-URL note only for a hidden community', async () => {
    await renderAndWaitForList([philly, ues])

    expect(within(rowFor(/philadelphia/i)).queryByText(/not on the switcher or sitemap/i)).not.toBeInTheDocument()
    expect(within(rowFor(/upper east side/i)).getByText(/not on the switcher or sitemap/i)).toBeInTheDocument()
  })

  it('offers "Publish" for a hidden community and "Unpublish" for a visible one', async () => {
    await renderAndWaitForList([philly, ues])

    expect(within(rowFor(/philadelphia/i)).getByRole('button', { name: /^unpublish$/i })).toBeInTheDocument()
    expect(within(rowFor(/upper east side/i)).getByRole('button', { name: /^publish$/i })).toBeInTheDocument()
  })

  it('PATCHes visible:true and flips the row to "Live" on Publish', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList([philly, ues])
    vi.mocked(fetchJson).mockResolvedValueOnce({ community: { ...ues, visible: true, previewToken: null } })

    await user.click(within(rowFor(/upper east side/i)).getByRole('button', { name: /^publish$/i }))

    await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(1))
    const call = vi.mocked(fetchJson).mock.calls[0]!
    expect(call[0]).toBe('/api/admin/communities/ues')
    const init = call[1] as RequestInit
    expect(init.method).toBe('PATCH')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body as string)).toEqual({ visible: true })

    expect(await within(rowFor(/upper east side/i)).findByText('Live')).toBeInTheDocument()
  })

  it('shows a server-side error inline and leaves the community\'s visibility unchanged', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error('Could not update visibility.'))
    const user = userEvent.setup()
    await renderAndWaitForList([philly, ues])

    await user.click(within(rowFor(/upper east side/i)).getByRole('button', { name: /^publish$/i }))

    expect(await screen.findByText('Could not update visibility.')).toBeInTheDocument()
    expect(within(rowFor(/upper east side/i)).getByText('Hidden')).toBeInTheDocument()
  })
})
