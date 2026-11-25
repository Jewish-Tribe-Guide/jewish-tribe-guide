// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CommunityManager from './CommunityManager'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import { adminBase } from '@/lib/adminNav'
import type { Community } from '@/lib/communityStore'
import { readFileSync } from 'fs'
import { mockRouter } from '@/test/nextNavigationMock'

// /admin's Communities and New community (Nov 25, boards 1, 2f and 3).
// fetchJson/parseOkJson mocked: the list loads through a raw fetch() and
// parseOkJson; everything else (Google's cities, create, publish, delete)
// goes through fetchJson, answered here by address.

vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter, usePathname: () => '/admin', useSearchParams: () => new URLSearchParams() }))

type TestCommunity = Community & {
  adminEmails: string[]
  notifyMutedEmails: string[]
  notifyReviewEmails: string[]
  previewToken: string | null
  placeCount?: number
}

function makeCommunity(overrides: Partial<TestCommunity> = {}): TestCommunity {
  return {
    slug: 'philly',
    name: 'Philadelphia Jewish Community',
    shortName: 'PJC',
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
    adminEmails: [],
    notifyMutedEmails: [],
    notifyReviewEmails: [],
    previewToken: null,
    ...overrides,
  }
}

const philly = makeCommunity({ slug: 'philly', name: 'Philadelphia', isDefault: true, visible: true, adminEmails: ['a@x.org', 'b@x.org', 'c@x.org'], placeCount: 150 })
const ues = makeCommunity({
  slug: 'ues',
  name: 'Upper East Side',
  region: 'Manhattan',
  isDefault: false,
  visible: false,
  adminEmails: ['jane@example.com', 'sam@example.com'],
  previewToken: 'super-secret-token',
  placeCount: 4,
})

function mockList(communities: TestCommunity[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response))
  vi.mocked(parseOkJson).mockResolvedValue({ communities })
}

async function renderAndWaitForList(communities: TestCommunity[] = [philly]) {
  mockList(communities)
  render(<CommunityManager token="tok" />)
  await screen.findByRole('button', { name: 'New community' })
}

function cardFor(slug: string): HTMLElement {
  const card = document.querySelector<HTMLElement>(`[data-community-slug="${slug}"]`)
  if (!card) throw new Error(`no card for ${slug}`)
  return card
}

const CITIES = [
  { placeId: 'p-md', city: 'Baltimore', area: 'MD, USA' },
  { placeId: 'p-oh', city: 'Baltimore', area: 'OH, USA' },
]
const PLACES: Record<string, object> = {
  'p-md': { city: 'Baltimore', area: 'Maryland', lat: 39.29, lng: -76.61, timezone: 'America/New_York' },
  'p-oh': { city: 'Baltimore', area: 'Ohio', lat: 39.84, lng: -82.6, timezone: 'America/New_York' },
}

// Google's answers, and whatever a test sets for the writes.
let writes: (url: string, init: RequestInit) => unknown
function answerGoogle() {
  vi.mocked(fetchJson).mockImplementation(async (url: string, init?: RequestInit) => {
    const u = new URL(url, 'http://x')
    if (u.pathname === '/api/admin/cities') {
      const placeId = u.searchParams.get('placeId')
      if (placeId) return { ok: true, city: PLACES[placeId] }
      return { ok: true, cities: CITIES }
    }
    return writes(url, init ?? {})
  })
}

function callsTo(path: string) {
  return vi.mocked(fetchJson).mock.calls.filter(([url]) => String(url).startsWith(path))
}

async function openNew(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'New community' }))
  return screen.findByRole('combobox', { name: 'Which city?' })
}

async function pickBaltimore(user: ReturnType<typeof userEvent.setup>) {
  const box = await openNew(user)
  await user.type(box, 'Balti')
  await user.click(await screen.findByRole('option', { name: 'Baltimore, MD, USA' }))
  await screen.findByRole('button', { name: 'Create Baltimore' })
}

beforeEach(() => {
  writes = () => ({ community: makeCommunity({ slug: 'baltimore', isDefault: false }) })
  answerGoogle()
  window.history.replaceState({}, '', '/admin')
  mockRouter.push.mockImplementation((url: string) => window.history.pushState({}, '', url))
  mockRouter.replace.mockImplementation((url: string) => window.history.replaceState({}, '', url))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('CommunityManager — the list (board 3)', () => {
  it('shows the default community as one row to its admin: name, address, admins, Live', async () => {
    await renderAndWaitForList([philly, ues])
    const row = cardFor('philly')
    expect(row.tagName).toBe('A')
    expect(row).toHaveAttribute('href', adminBase('philly'))
    expect(row).toHaveTextContent('Philadelphia')
    expect(row).toHaveTextContent('/philly · 3 admins')
    expect(within(row).getByText('Live')).toBeInTheDocument()
    expect(within(row).queryByRole('button')).toBeNull()
    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith('/api/admin/communities', expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }))
  })

  it('gives another community its facts and buttons: Open its admin, Copy preview link, Publish', async () => {
    await renderAndWaitForList([philly, ues])
    const card = cardFor('ues')
    expect(card).toHaveTextContent('/ues · 2 admins · 4 places')
    expect(within(card).getByText('Hidden')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Open its admin' })).toHaveAttribute('href', adminBase('ues'))
    expect(within(card).getByRole('button', { name: 'Copy preview link' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Publish' })).toBeInTheDocument()
  })

  it('marks the community just made (?made=)', async () => {
    window.history.replaceState({}, '', '/admin?made=ues')
    await renderAndWaitForList([philly, ues, makeCommunity({ slug: 'bos', name: 'Boston', isDefault: false })])
    expect(cardFor('ues')).toHaveAttribute('data-just-made', 'true')
    expect(cardFor('ues').className).toContain('border-primary')
    expect(cardFor('bos')).not.toHaveAttribute('data-just-made')
    // At the top, above the default community (board 3).
    expect([...document.querySelectorAll('[data-community-slug]')].map((el) => el.getAttribute('data-community-slug'))).toEqual(['ues', 'philly', 'bos'])
  })

  // GET /api/admin/communities is superadmin-gated: a community's own admin
  // gets a plain line, not the list.
  it('shows an access-denied message instead of the list when the endpoint 401s', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response))
    render(<CommunityManager token="tok" />)
    expect(await screen.findByText('Only the site owner can create or browse other communities.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New community' })).not.toBeInTheDocument()
    expect(parseOkJson).not.toHaveBeenCalled()
  })
})

describe('CommunityManager — New community (boards 1 and 2f)', () => {
  // Nov 18: it was only state, so the browser's Back left the console.
  it('is a screen of its own: Back closes it, Forward and a reload open it, ‹ Communities goes back', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList()
    await openNew(user)
    await waitFor(() => expect(window.location.search).toBe('?step=new'))

    act(() => history.back())
    expect(await screen.findByRole('button', { name: 'New community' })).toBeInTheDocument()
    act(() => history.forward())
    expect(await screen.findByRole('heading', { name: 'New community' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Communities/ }))
    await waitFor(() => expect(window.location.search).toBe(''))
    expect(screen.getByRole('button', { name: 'New community' })).toBeInTheDocument()

    cleanup()
    window.history.replaceState({}, '', '/admin?step=new')
    mockList([philly])
    render(<CommunityManager token="tok" />)
    expect(await screen.findByRole('combobox', { name: 'Which city?' })).toBeInTheDocument()
  })

  it('asks Google for cities as you type, and fills the rest in from the one picked', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList()
    const box = await openNew(user)
    await user.type(box, 'Balti')

    const options = await screen.findAllByRole('option')
    expect(options.map((o) => o.getAttribute('aria-label'))).toEqual(['Baltimore, MD, USA', 'Baltimore, OH, USA'])
    expect(callsTo('/api/admin/cities?q=').at(-1)![0]).toBe('/api/admin/cities?q=Balti')

    await user.click(options[0]!)
    expect(await screen.findByText('Baltimore, Maryland')).toBeInTheDocument()
    expect(screen.getByText('Eastern Time · map starts downtown')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Baltimore Jewish Guide')
    expect(screen.getByText('/baltimore')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Starter pack' })).toHaveAttribute('aria-checked', 'true')
    const pack = screen.getByRole('list', { name: 'In the starter pack' })
    expect(within(pack).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Synagogues', 'Food', 'Grocery', 'Mikvah', 'Eruv', 'Candle Lighting', 'Map'])
    expect(screen.getByRole('button', { name: 'Create Baltimore' })).toBeInTheDocument()
  })

  it('picks with the arrow keys and Enter', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList()
    const box = await openNew(user)
    await user.type(box, 'Balti')
    await screen.findAllByRole('option')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(await screen.findByText('Baltimore, Ohio')).toBeInTheDocument()
  })

  it('says so when Google isn’t answering, rather than showing no cities', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error('Google isn’t answering. Try again.'))
    const user = userEvent.setup()
    await renderAndWaitForList()
    await user.type(await openNew(user), 'Balti')
    expect(await screen.findByText('Google isn’t answering. Try again.')).toBeInTheDocument()
  })

  it('Change goes back to Which city?', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList()
    await pickBaltimore(user)
    await user.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByRole('combobox', { name: 'Which city?' })).toBeInTheDocument()
  })

  it('creates it with the city, the name, its address, who runs it and the pack, then lands on the list marking it', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList()
    await pickBaltimore(user)

    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Jewish Baltimore')
    await user.click(screen.getByRole('button', { name: 'Edit its address' }))
    await user.clear(screen.getByLabelText(/Its address/))
    await user.type(screen.getByLabelText(/Its address/), 'bmore')

    const email = screen.getByLabelText('Add an admin’s email')
    await user.type(email, 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText('That isn’t an email address.')).toBeInTheDocument()
    await user.clear(email)
    await user.type(email, 'Rivka.Levin@example.com{Enter}')
    await user.type(email, 'sam@example.com')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText('RL')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove sam@example.com' }))

    await user.click(screen.getByRole('switch', { name: 'Starter pack' }))
    expect(screen.queryByRole('list', { name: 'In the starter pack' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Create Baltimore' }))
    await waitFor(() => expect(callsTo('/api/admin/communities')).toHaveLength(1))
    const [url, init] = callsTo('/api/admin/communities')[0]!
    expect(url).toBe('/api/admin/communities')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      slug: 'bmore',
      name: 'Jewish Baltimore',
      city: { city: 'Baltimore', area: 'Maryland', lat: 39.29, lng: -76.61 },
      adminEmails: ['rivka.levin@example.com'],
      starterPack: false,
    })
  })

  it('counts an email typed but not yet added', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList()
    await pickBaltimore(user)
    await user.type(screen.getByLabelText('Add an admin’s email'), 'jane@example.com')
    await user.click(screen.getByRole('button', { name: 'Create Baltimore' }))
    await waitFor(() => expect(callsTo('/api/admin/communities')).toHaveLength(1))
    const body = JSON.parse((callsTo('/api/admin/communities')[0]![1] as RequestInit).body as string)
    expect(body).toMatchObject({ adminEmails: ['jane@example.com'], starterPack: true, slug: 'baltimore' })
  })

  it('shows what the server refused, and stays on the screen', async () => {
    writes = () => {
      throw new Error('A community with that address already exists.')
    }
    const user = userEvent.setup()
    await renderAndWaitForList()
    await pickBaltimore(user)
    await user.click(screen.getByRole('button', { name: 'Create Baltimore' }))
    expect(await screen.findByText('A community with that address already exists.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Baltimore' })).toBeEnabled()
  })

  // Landing through the client router after a create got its response and
  // sat on the form, no error, in 4 of 7 runs of test:admin-write (and on
  // main in CI). jsdom can't watch a load; that suite proves the landing.
  it('never goes back to the client router to land after creating', () => {
    expect(readFileSync('src/components/admin/CommunityManager.tsx', 'utf8')).not.toContain('useRouter')
  })
})

describe('CommunityManager — deleting a community', () => {
  it('offers no delete option for the default community', async () => {
    await renderAndWaitForList([philly, ues])
    expect(within(cardFor('philly')).queryByRole('button', { name: /delete/i })).toBeNull()
    expect(within(cardFor('ues')).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('requires retyping the exact slug before "Delete forever" is enabled', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList([philly, ues])
    await user.click(within(cardFor('ues')).getByRole('button', { name: 'Delete' }))
    expect(screen.getByText((_c, el) => el?.tagName === 'P' && /permanently deletes[\s\S]*Upper East Side/.test(el.textContent ?? ''))).toBeInTheDocument()

    const deleteForever = screen.getByRole('button', { name: /delete forever/i })
    expect(deleteForever).toBeDisabled()
    const confirm = screen.getByLabelText(/type.*to confirm/i)
    await user.type(confirm, 'wrong-slug')
    expect(deleteForever).toBeDisabled()
    await user.clear(confirm)
    await user.type(confirm, 'ues')
    expect(deleteForever).toBeEnabled()
  })

  it('Cancel backs out of the confirmation without deleting', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList([philly, ues])
    await user.click(within(cardFor('ues')).getByRole('button', { name: 'Delete' }))
    await user.type(screen.getByLabelText(/type.*to confirm/i), 'ues')
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByText(/permanently deletes/i)).not.toBeInTheDocument()
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it('sends the confirmed slug to DELETE /api/admin/communities/:slug', async () => {
    writes = () => ({ ok: true })
    const user = userEvent.setup()
    await renderAndWaitForList([philly, ues])
    await user.click(within(cardFor('ues')).getByRole('button', { name: 'Delete' }))
    await user.type(screen.getByLabelText(/type.*to confirm/i), 'ues')
    await user.click(screen.getByRole('button', { name: /delete forever/i }))

    await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(1))
    const [url, init] = vi.mocked(fetchJson).mock.calls[0]!
    expect(url).toBe('/api/admin/communities/ues')
    expect((init as RequestInit).method).toBe('DELETE')
    expect(((init as RequestInit).headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ confirmSlug: 'ues' })
  })

  it('shows a server-side error inline and leaves the community in the list', async () => {
    writes = () => {
      throw new Error('The default community cannot be deleted.')
    }
    const user = userEvent.setup()
    await renderAndWaitForList([philly, ues])
    await user.click(within(cardFor('ues')).getByRole('button', { name: 'Delete' }))
    await user.type(screen.getByLabelText(/type.*to confirm/i), 'ues')
    await user.click(screen.getByRole('button', { name: /delete forever/i }))
    expect(await screen.findByText('The default community cannot be deleted.')).toBeInTheDocument()
    expect(cardFor('ues')).toBeInTheDocument()
  })
})

describe('CommunityManager — the hidden community’s preview link', () => {
  afterEach(() => {
    delete (navigator as { clipboard?: unknown }).clipboard
  })

  it('offers no preview link for a live community', async () => {
    await renderAndWaitForList([philly, { ...ues, visible: true }])
    expect(within(cardFor('ues')).queryByRole('button', { name: /preview link/i })).toBeNull()
    expect(within(cardFor('ues')).getByRole('button', { name: 'Unpublish' })).toBeInTheDocument()
  })

  it('copies the ?access= link and says so', async () => {
    // userEvent.setup() installs its own clipboard; ours goes on after it.
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await renderAndWaitForList([philly, ues])
    await user.click(within(cardFor('ues')).getByRole('button', { name: 'Copy preview link' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/ues\?access=super-secret-token$/))
    expect(await within(cardFor('ues')).findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('shows the link to copy by hand when the clipboard says no', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true })
    await renderAndWaitForList([philly, ues])
    await user.click(within(cardFor('ues')).getByRole('button', { name: 'Copy preview link' }))
    expect((await screen.findByLabelText<HTMLInputElement>('Preview link')).value).toMatch(/\/ues\?access=super-secret-token$/)
  })
})

describe('CommunityManager — publishing a community', () => {
  it('PATCHes visible:true and flips the card to Live on Publish', async () => {
    writes = () => ({ community: { ...ues, visible: true, previewToken: null } })
    const user = userEvent.setup()
    await renderAndWaitForList([philly, ues])
    await user.click(within(cardFor('ues')).getByRole('button', { name: 'Publish' }))

    await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(1))
    const [url, init] = vi.mocked(fetchJson).mock.calls[0]!
    expect(url).toBe('/api/admin/communities/ues')
    expect((init as RequestInit).method).toBe('PATCH')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ visible: true })
    expect(await within(cardFor('ues')).findByText('Live')).toBeInTheDocument()
    expect(within(cardFor('ues')).queryByRole('button', { name: 'Copy preview link' })).toBeNull()
  })

  it('shows a server-side error inline and leaves the community’s visibility unchanged', async () => {
    writes = () => {
      throw new Error('Could not update visibility.')
    }
    const user = userEvent.setup()
    await renderAndWaitForList([philly, ues])
    await user.click(within(cardFor('ues')).getByRole('button', { name: 'Publish' }))
    expect(await screen.findByText('Could not update visibility.')).toBeInTheDocument()
    expect(within(cardFor('ues')).getByText('Hidden')).toBeInTheDocument()
  })
})
