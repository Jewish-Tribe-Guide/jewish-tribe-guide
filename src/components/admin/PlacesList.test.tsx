// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { ADMIN_AREA_TAPPED } from '@/lib/adminNav'
import { fetchJson } from '@/lib/fetchJson'
import type { AdminPlace } from '@/lib/adminPlaces'
import type ListingEditorScreen from './ListingEditorScreen'
import PlacesList from './PlacesList'
import { forgetWatchJobs } from './useWatchJobs'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/places',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))
// The editor is the site's own (ListingEditor's tests cover it); here, what
// Places hands it.
const editor = vi.hoisted(() => ({ props: null as null | ComponentProps<typeof ListingEditorScreen> }))
vi.mock('./ListingEditorScreen', () => ({
  default: (props: ComponentProps<typeof ListingEditorScreen>) => {
    editor.props = props
    return (
      <>
        <h2>{props.heading}</h2>
        {props.adminSave?.beside}
      </>
    )
  },
}))

const day = new Date(2026, 9, 17, 12).toISOString()
const place = (name: string, over: Partial<AdminPlace> = {}): AdminPlace => ({
  id: name.toLowerCase().replace(/\W+/g, '-'),
  name,
  category: 'food',
  status: 'approved',
  hasAddress: true,
  changedAt: day,
  listing: { id: name, category: 'food', name, anchorId: 'all', distance: 0, address: '1 Main St' },
  ...over,
})
const categories = [makeCategory({ id: 'food', label: 'Food', pluralLabel: 'Food' }), makeCategory({ id: 'networking', label: 'Networking', pluralLabel: 'Networking' }), makeCategory({ id: 'map', label: 'Map', pluralLabel: 'Map', kind: 'map' } as never)]
const places = [
  place('Goldie'),
  place('Base Philadelphia', { category: 'networking', hasAddress: false }),
  place('Old Deli', { status: 'archived' }),
]

/** What the jobs answer; none, and nothing's known to check anything. */
let jobsToServe: [string, Record<string, unknown>][] = []

const menu = (name: RegExp) => screen.getByRole('button', { name })
async function choose(name: RegExp, option: RegExp) {
  const user = userEvent.setup()
  await user.click(menu(name))
  await user.click(screen.getByRole('menuitemradio', { name: option }))
}

function renderPlaces(list = places) {
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    if (init?.method) return { ok: true }
    if (String(url).includes('/api/admin/listings')) return { ok: true, places: list, categories }
    if (String(url).includes('/api/admin/categories')) return { ok: true, categories }
    const job = jobsToServe.find(([path]) => String(url).includes(path))
    if (job) return { ok: true, ...job[1] }
    throw new Error('down')
  })
  renderWithProviders(<PlacesList token="tok" />, { community: { slug: 'philly' } })
}
const sent = (method: string) =>
  vi
    .mocked(fetchJson)
    .mock.calls.filter(([, init]) => init?.method === method)
    .map(([url]) => url)

beforeEach(() => window.history.replaceState(null, '', '/philly/admin/places'))
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  editor.props = null
  jobsToServe = []
  forgetWatchJobs()
})

describe('Places', () => {
  it('has Watches at its foot, with how much it reads', async () => {
    renderPlaces()
    await screen.findByRole('region', { name: 'Places' })
    expect(within(screen.getByRole('region', { name: 'Watches' })).getByRole('link', { name: /Watches/ })).toHaveAttribute('href', '/philly/admin/watches')
  })

  it('lists what’s on the site, by name, with what’s wrong first and its category', async () => {
    renderPlaces()
    const list = await screen.findByRole('region', { name: 'Places' })
    expect(within(list).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Open Base Philadelphia', 'Open Goldie'])
    expect(screen.getByRole('button', { name: 'Open Base Philadelphia' })).toHaveTextContent(/^Base PhiladelphiaNo addressNetworking$/)
    expect(screen.getByRole('button', { name: 'Open Goldie' })).toHaveTextContent(/^GoldieFood$/)
    expect(screen.getByText('2 places')).toBeInTheDocument()
    expect(screen.getByText('2 of 2')).toBeInTheDocument()
  })

  it('shows the first 50, all of them, and folds back to 50', async () => {
    const user = userEvent.setup()
    renderPlaces(Array.from({ length: 52 }, (_, i) => place(`Place ${String(i).padStart(2, '0')}`)))
    expect(await screen.findByText('50 of 52')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show all' }))
    expect(screen.getByText('52 of 52')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(screen.getByText('50 of 52')).toBeInTheDocument()
  })

  it('Archived is a choice in the first menu, and says so in the address', async () => {
    renderPlaces()
    await screen.findByRole('region', { name: 'Places' })
    await choose(/^On the site/, /^Archived \(1\)/)
    expect(menu(/^On the site: Archived/)).toHaveTextContent('Archived')
    expect(screen.getByRole('button', { name: 'Open Old Deli' })).toHaveTextContent('Archived Oct 17')
    expect(screen.queryByRole('button', { name: 'Open Goldie' })).toBeNull()
    expect(window.location.search).toBe('?show=archived')
    await choose(/^On the site/, /^No address \(1\)/)
    expect(screen.getByRole('button', { name: 'Open Base Philadelphia' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Goldie' })).toBeNull()
  })

  // The user, Oct 31: Map, Eruv and Zmanim aren't places.
  it('the category menu lists only categories of places', async () => {
    const user = userEvent.setup()
    renderPlaces()
    await screen.findByRole('region', { name: 'Places' })
    await user.click(menu(/^Category/))
    const names = screen.getAllByRole('menuitemradio').map((o) => o.textContent)
    expect(names).toEqual(['All categories', 'Food', 'Networking'])
  })

  describe('Checked by', () => {
    const shul = makeCategory({ id: 'food', label: 'Shul', pluralLabel: 'Shuls', detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
    const shuls = [place('Alpha'), place('Bravo'), place('Charlie')]
    const everyJob = (times: unknown[]): [string, Record<string, unknown>][] => [
      ['hours?counts&job=times', { name: 'Shul times', places: times }],
      ['hours?counts', { name: 'Mikvah hours', places: [] }],
      ['main-dishes', { places: [] }],
      ['watches/hospitals', { hospitals: [] }],
      ['watches/sites', { places: [] }],
      ['watches/eruv', { available: true, eruvim: [] }],
      ['watches/kosher', { lists: [], places: [] }],
      ['watches/google', { counts: {}, places: [] }],
      ['watches/links', { links: [] }],
    ]
    const page = (id: string, failing = false) => ({ id, name: id, pages: [{ source: '', watch: { active: true, failingSince: failing ? '2026-10-20T00:00:00Z' : null, lastError: failing ? 'down' : null, lastRunAt: new Date().toISOString(), lastOkAt: failing ? null : new Date().toISOString(), lastCheck: null, createdAt: '2026-10-01T00:00:00Z' } }], findings: [], fields: [], off: false })

    function renderShuls(address = '') {
      window.history.replaceState(null, '', `/philly/admin/places${address}`)
      jobsToServe = everyJob([page('Alpha')])
      vi.mocked(fetchJson).mockImplementation(async (url, init) => {
        if (init?.method) return { ok: true }
        if (String(url).includes('/api/admin/listings')) return { ok: true, places: shuls, categories: [shul] }
        if (String(url).includes('/api/admin/categories')) return { ok: true, categories: [shul] }
        const job = jobsToServe.find(([path]) => String(url).includes(path))
        if (job) return { ok: true, ...job[1] }
        return { ok: true, available: true, kinds: [], off: [] }
      })
      renderWithProviders(<PlacesList token="tok" />, { community: { slug: 'philly' } })
    }

    it('lands from Watches on what isn’t watched, saying what isn’t', async () => {
      renderShuls('?checked=not-watched')
      expect(await screen.findByRole('button', { name: 'Open Bravo' })).toHaveTextContent('Not watched: minyan times')
      expect(screen.queryByRole('button', { name: 'Open Alpha' })).toBeNull()
      expect(screen.getByText('2 places')).toBeInTheDocument()
    })

    it('narrows by what checks a place, with counts, and keeps it in the address', async () => {
      renderShuls()
      await screen.findByRole('button', { name: 'Open Alpha' })
      await waitFor(() => expect(menu(/^Checked by/)).toBeEnabled())
      await choose(/^Checked by/, /^Their website \(1\)/)
      expect(screen.getByRole('button', { name: 'Open Alpha' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Open Bravo' })).toBeNull()
      expect(window.location.search).toBe('?checked=website')
    })

    it('an opened place’s rows name only the job that reads them', async () => {
      const user = userEvent.setup()
      renderShuls()
      await waitFor(() => expect(menu(/^Checked by/)).toBeEnabled())
      await user.click(screen.getByRole('button', { name: 'Open Bravo' }))
      renderWithProviders(editor.props!.rowAside!({ id: 'minyans:weekday', title: 'x', kind: 'minyans', fields: [], box: 'weekday' }) as React.ReactElement)
      expect(screen.getByTestId('row-job')).toHaveTextContent(/^Nothing$/)
    })
  })

  it('opens on Archived from the old tab’s address', async () => {
    window.history.replaceState(null, '', '/philly/admin/places?show=archived')
    renderPlaces()
    expect(await screen.findByRole('button', { name: 'Open Old Deli' })).toBeInTheDocument()
  })

  it('finds by name and narrows by category', async () => {
    const user = userEvent.setup()
    renderPlaces()
    await user.type(await screen.findByLabelText('Find a place by name'), 'gold')
    expect(screen.getByRole('button', { name: 'Open Goldie' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Base Philadelphia' })).toBeNull()
    await choose(/^Category/, /^Networking/)
    expect(screen.getByText('No places match.')).toBeInTheDocument()
    expect(window.location.search).toBe('?category=networking')
  })

  it('opens narrowed to the category a category page’s count names', async () => {
    window.history.replaceState(null, '', '/philly/admin/places?category=networking')
    renderPlaces()
    expect(await screen.findByRole('button', { name: 'Open Base Philadelphia' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Goldie' })).toBeNull()
    expect(menu(/^Category: Networking/)).toBeInTheDocument()
  })

  it('opens a place in its editor, which updates the listing directly', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}')))
    renderPlaces()
    await user.click(await screen.findByRole('button', { name: 'Open Goldie' }))
    expect(screen.getByRole('heading', { name: 'Goldie' })).toBeInTheDocument()
    expect(editor.props?.adminSave?.label).toBe('Update the listing')
    expect(editor.props?.item?.name).toBe('Goldie')
    await editor.props!.adminSave!.via({ payload: { name: 'Goldie’s' } as never, submittedBy: undefined, company: '', turnstileToken: '' })
    expect(fetch).toHaveBeenCalledWith('/api/admin/listings/goldie?community=philly', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ payload: { name: 'Goldie’s' } }) }))
    vi.unstubAllGlobals()
  })

  it('Archive it asks once, then takes it off the site', async () => {
    const user = userEvent.setup()
    renderPlaces()
    await user.click(await screen.findByRole('button', { name: 'Open Goldie' }))
    await user.click(screen.getByRole('button', { name: 'Archive it' }))
    expect(sent('DELETE')).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Leave it' }))
    expect(sent('DELETE')).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Archive it' }))
    await user.click(screen.getByRole('button', { name: 'Archive it' }))
    await waitFor(() => expect(sent('DELETE')).toEqual(['/api/admin/listings/goldie?community=philly']))
    // Back on the list, read afresh.
    expect(await screen.findByRole('region', { name: 'Places' })).toBeInTheDocument()
  })

  // Nov 1, board PlacesEruv4: eruvs live in their own table, and are places.
  describe('eruvs', () => {
    const eruvCategory = makeCategory({ id: 'eruv-information', label: 'Eruv', pluralLabel: 'Eruv', kind: 'eruv' } as never)
    const eruv = { id: 'cc', name: 'Center City Eruv', covers: 'Center City', website: null, hotline: null, alertsUrl: null, statusUrl: null, statusDated: false, status: null, statusWords: null, statusPostedOn: null, statusCheckedAt: null, statusErrorAt: null, statusError: null, lineUrl: null, sortOrder: 1, active: true, rawLine: null, lineReadAt: null, lineError: null, lineLeaveOut: [], lineHidePoints: false, lineMissing: [], lineColor: null, statusEmail: null, statusEmailKept: null, updatedAt: day }
    const posted: unknown[] = []
    function renderEruvs() {
      vi.mocked(fetchJson).mockImplementation(async (url, init) => {
        if (init?.method) {
          const body = JSON.parse(String(init.body))
          posted.push(body)
          return { ok: true, eruv: { ...eruv, id: 'new-eruv', name: body.name } }
        }
        if (String(url).includes('/api/admin/listings')) return { ok: true, places, categories: [...categories, eruvCategory] }
        if (String(url).includes('/api/admin/categories')) return { ok: true, categories: [...categories, eruvCategory] }
        if (String(url).includes('/api/admin/watches/eruv')) return { available: true, timezone: 'America/New_York', eruvim: [eruv], findings: [], watches: [] }
        throw new Error('down')
      })
      renderWithProviders(<PlacesList token="tok" />, { community: { slug: 'philly' } })
    }
    afterEach(() => {
      posted.length = 0
    })

    it('are listed under their category, and open as an eruv', async () => {
      const user = userEvent.setup()
      renderEruvs()
      await screen.findByRole('button', { name: 'Open Center City Eruv' })
      await choose(/^Category/, /^Eruv/)
      expect(screen.getByRole('button', { name: 'Open Center City Eruv' })).toHaveTextContent(/^Center City EruvEruv/)
      expect(screen.queryByRole('button', { name: 'Open Goldie' })).toBeNull()
      expect(screen.getByText('1 place')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Open Center City Eruv' }))
      expect(await screen.findByTestId('editor-row-status')).toBeInTheDocument()
    })

    it('Add a place offers Eruv, on the same Add screen, and goes back to Places', async () => {
      const user = userEvent.setup()
      renderEruvs()
      await screen.findByRole('button', { name: 'Open Center City Eruv' })
      await choose(/^Category/, /^Eruv/)
      await user.click(screen.getByRole('button', { name: /Add a place/ }))
      expect(await screen.findByText('Goes live as soon as you add it, with no review.')).toBeInTheDocument()
      expect(screen.getByTestId('editor-empty')).toHaveTextContent('Status')
      expect(screen.getByRole('button', { name: 'Still needed: Name' })).toBeDisabled()
      await user.click(screen.getByTestId('editor-row-name'))
      await user.type(screen.getByLabelText('Name'), 'New Eruv')
      await user.click(screen.getByRole('button', { name: 'Add listing' }))
      expect(posted).toEqual([{ action: 'add', name: 'New Eruv' }])
      expect(await screen.findByRole('region', { name: 'Places' })).toBeInTheDocument()
    })
  })

  it('brings an archived place back, or deletes it for good after asking', async () => {
    const user = userEvent.setup()
    renderPlaces()
    await screen.findByRole('region', { name: 'Places' })
    await choose(/^On the site/, /^Archived \(1\)/)
    await user.click(screen.getByRole('button', { name: 'Open Old Deli' }))
    await user.click(screen.getByRole('button', { name: 'Delete for good' }))
    expect(screen.getByText('Delete Old Deli for good? This can’t be undone.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Leave it' }))
    await user.click(screen.getByRole('button', { name: 'Bring it back' }))
    await waitFor(() => expect(sent('PATCH')).toEqual(['/api/admin/archived-listings/old-deli?community=philly']))
    expect(sent('DELETE')).toEqual([])
  })

  it('adds a place to the category picked, or asks which', async () => {
    const user = userEvent.setup()
    renderPlaces()
    await user.click(await screen.findByRole('button', { name: 'Add a place' }))
    await user.selectOptions(screen.getByLabelText('Which category'), 'food')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Add a place' })).toBeInTheDocument()
    expect(screen.getByLabelText('Find the place')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Fill it in yourself' }))
    expect(editor.props?.category.id).toBe('food')
    expect(editor.props?.adminSubmit?.token).toBe('tok')
    expect(editor.props?.rowSource).toBeTypeOf('function')
    editor.props!.adminSubmit!.onAdded!({ id: 'new', category: 'food', name: 'New', anchorId: 'all', distance: 0, address: '' })

    await screen.findByRole('button', { name: /^Category/ })
    await choose(/^Category/, /^Networking/)
    await user.click(screen.getByRole('button', { name: 'Add a place' }))
    await user.click(await screen.findByRole('button', { name: 'Fill it in yourself' }))
    expect(editor.props?.category.id).toBe('networking')
  })
})

// The user, Oct 31: "Swiping back from a place goes to To do."
describe('Places, the way back from a place', () => {
  it('swiping back lands on the list, as the place is an entry in the history', async () => {
    const user = userEvent.setup()
    renderPlaces()
    const before = window.history.length
    await user.click(await screen.findByRole('button', { name: 'Open Goldie' }))
    expect(screen.getByRole('heading', { name: 'Goldie' })).toBeInTheDocument()
    expect(window.history.length).toBe(before + 1)
    expect(window.history.state.placeOpen).toBe('goldie')
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    })
    expect(await screen.findByRole('region', { name: 'Places' })).toBeInTheDocument()
  })

  it('tapping Places in the nav goes back to the list', async () => {
    const user = userEvent.setup()
    renderPlaces()
    await user.click(await screen.findByRole('button', { name: 'Open Goldie' }))
    act(() => {
      window.dispatchEvent(new Event(ADMIN_AREA_TAPPED))
    })
    expect(await screen.findByRole('region', { name: 'Places' })).toBeInTheDocument()
  })
})
