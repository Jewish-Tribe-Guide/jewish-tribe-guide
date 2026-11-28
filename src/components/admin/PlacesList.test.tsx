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

// Next's router as it behaves here: the entry written as it lands (at once).
beforeEach(() => {
  window.history.replaceState(null, '', '/philly/admin/places')
  mockRouter.push.mockImplementation((url: string) => window.history.pushState({}, '', url))
  mockRouter.replace.mockImplementation((url: string) => window.history.replaceState({}, '', url))
})
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  editor.props = null
  jobsToServe = []
  forgetWatchJobs()
})

describe('Places', () => {
  // Nov 1 (WatchE19): it was at the foot, and went unseen.
  // Nov 25 (item 95): Watches opens from Reports now.
  it('has no Watches row', async () => {
    renderPlaces()
    await screen.findByRole('region', { name: 'Places' })
    expect(screen.queryByRole('link', { name: /Watches/ })).toBeNull()
  })

  // The user, Nov 28: on a computer, Add sits at the right of the filters'
  // row, under the search; a window too narrow for both floats it again.
  it('Add a place is at the end of the filters’ row on a computer', async () => {
    renderPlaces()
    const add = await screen.findByRole('button', { name: 'Add a place' })
    expect(add.className).not.toContain('fixed')
    expect(add).toHaveTextContent(/^Add$/)
    // The filters' shape and height, in blue (the user, Nov 28).
    const menu = screen.getByRole('button', { name: /On the site/ })
    for (const c of ['h-11', 'rounded-[10px]']) {
      expect(menu.className).toContain(c)
      expect(add.className).toContain(c)
    }
    expect(add.className).toContain('bg-primary')
    const row = add.closest('[data-testid="places-filters"]')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByRole('button', { name: /On the site/ })).toBeTruthy()
    expect(row!.lastElementChild).toBe(add)
  })

  // Board l06 (Nov 28): narrow, the four menus are one Filters button,
  // and Add sits beside it; What are you adding? opens at the top.
  it('in a narrow window, Filters and Add share the row, and Add goes to the top to ask what you’re adding', async () => {
    const user = userEvent.setup()
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('1023px'), addEventListener: () => {}, removeEventListener: () => {} }))
    renderPlaces()
    const add = await screen.findByRole('button', { name: 'Add a place' })
    const row = add.closest('[data-testid="places-filters"]') as HTMLElement
    expect(within(row).getAllByRole('button').map((b) => b.textContent)).toEqual(['Filters', 'Add'])
    expect(screen.queryByRole('button', { name: /^On the site/ })).toBeNull()
    await user.click(add)
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
    expect(screen.getByRole('heading', { name: 'What are you adding?' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add a place' })).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('narrow, the Filters sheet picks as a draft, counts, and narrows on Show', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('1023px'), addEventListener: () => {}, removeEventListener: () => {} }))
    renderPlaces()
    await user.click(await screen.findByRole('button', { name: 'Filters' }))
    const sheet = screen.getByRole('dialog', { name: 'Filters' })
    expect(within(sheet).getAllByRole('combobox').map((c) => c.closest('label')?.firstChild?.textContent)).toEqual(['On the site', 'Category', 'Watch', 'Source'])
    expect(within(sheet).getByRole('button', { name: 'Show 2 places' })).toBeInTheDocument()
    await user.selectOptions(within(sheet).getByRole('combobox', { name: 'Category' }), 'networking')
    expect(screen.getByRole('button', { name: 'Open Goldie' })).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Show 1 place' }))
    expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open Goldie' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Filters · 1' })).toBeInTheDocument()
    expect(window.location.search).toBe('?category=networking')
    vi.unstubAllGlobals()
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

  it('tells two places with one name apart by their street', async () => {
    renderPlaces([
      place('ACME', { id: 'acme-1', listing: { id: 'acme-1', category: 'food', name: 'ACME', anchorId: 'all', distance: 0, address: '1 Main St, Philadelphia' } }),
      place('ACME', { id: 'acme-2', listing: { id: 'acme-2', category: 'food', name: 'ACME', anchorId: 'all', distance: 0, address: '9 Oak Ave, Bala Cynwyd' } }),
      place('Goldie'),
    ])
    await screen.findByRole('region', { name: 'Places' })
    expect(screen.getByRole('button', { name: 'Open ACME, 1 Main St' })).toHaveTextContent(/^ACME1 Main StFood$/)
    expect(screen.getByRole('button', { name: 'Open ACME, 9 Oak Ave' })).toHaveTextContent(/^ACME9 Oak AveFood$/)
    expect(screen.getByRole('button', { name: 'Open Goldie' })).toHaveTextContent(/^GoldieFood$/)
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
    expect(names).toEqual(['All categories', 'Food (1)', 'Networking (1)'])
  })

  // The user, Nov 4: "if we are looking at archived and hit category filter
  // it should only show categories that would show up. With a number too."
  it('the category menu lists only the categories under the other menus, with how many', async () => {
    const user = userEvent.setup()
    renderPlaces()
    await screen.findByRole('region', { name: 'Places' })
    await choose(/^On the site/, /^Archived/)
    await user.click(menu(/^Category/))
    expect(screen.getAllByRole('menuitemradio').map((o) => o.textContent)).toEqual(['All categories', 'Food (1)'])
  })

  describe('Watch and Source', () => {
    const shul = makeCategory({ id: 'food', placeKind: 'shuls', label: 'Shul', pluralLabel: 'Shuls', detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
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
      // A shul's this-week row asks these (useWeekEmails); unanswered,
      // its read threw after the test and failed CI's run (Nov 26).
      ['watches/newsletters', { newsletters: [] }],
      ['community-email', { email: null }],
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

    // A job page's From rows land here (?watch=times&source=website).
    it('lands from a job’s From row on its places, each saying its jobs', async () => {
      renderShuls('?watch=times&source=website')
      expect(await screen.findByRole('button', { name: 'Open Alpha' })).toHaveTextContent(/^AlphaMinyan timesShul$/)
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Open Bravo' })).toBeNull())
      expect(menu(/^Watch: Minyan times/)).toBeInTheDocument()
      expect(menu(/^Source: Website/)).toBeInTheDocument()
    })

    it('Nothing: what isn’t checked, saying what isn’t', async () => {
      renderShuls('?watch=nothing')
      await waitFor(() => expect(screen.getByRole('button', { name: 'Open Bravo' })).toHaveTextContent('Not checked: minyan times'))
      expect(screen.queryByRole('button', { name: 'Open Alpha' })).toBeNull()
      expect(screen.getByText('2 places')).toBeInTheDocument()
    })

    it('narrows by job and by source, with counts, and keeps both in the address', async () => {
      const user = userEvent.setup()
      renderShuls()
      await screen.findByRole('button', { name: 'Open Alpha' })
      await waitFor(() => expect(menu(/^Watch/)).toBeEnabled())
      await user.click(menu(/^Watch/))
      expect(screen.getAllByRole('menuitemradio').map((o) => o.textContent)).toEqual(['Any watch', 'Nothing (2)Something on it isn’t checked', 'Minyan times (1)'])
      await user.click(screen.getByRole('menuitemradio', { name: /^Minyan times/ }))
      expect(screen.queryByRole('button', { name: 'Open Bravo' })).toBeNull()
      expect(window.location.search).toBe('?watch=times')
      await user.click(menu(/^Source/))
      expect(screen.getAllByRole('menuitemradio').map((o) => o.textContent)).toEqual(['Any source', 'Website (1)'])
      await user.click(screen.getByRole('menuitemradio', { name: /^Website/ }))
      expect(window.location.search).toBe('?watch=times&source=website')
      expect(screen.getByRole('button', { name: 'Open Alpha' })).toBeInTheDocument()
    })

    it('has no Checked by any more', async () => {
      renderShuls('?checked=not-watched')
      await screen.findByRole('button', { name: 'Open Bravo' })
      expect(screen.getByRole('button', { name: 'Open Alpha' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Checked by/ })).toBeNull()
    })

    it('an opened place’s rows name only the job that reads them', async () => {
      const user = userEvent.setup()
      renderShuls()
      await waitFor(() => expect(menu(/^Watch/)).toBeEnabled())
      await user.click(screen.getByRole('button', { name: 'Open Bravo' }))
      renderWithProviders(editor.props!.rowAside!({ id: 'minyans:weekday', title: 'x', kind: 'minyans', fields: [], box: 'weekday' }) as React.ReactElement)
      expect(screen.getByTestId('row-job')).toHaveAttribute('data-job', 'Nothing')
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
    await screen.findByRole('region', { name: 'Places' })
    await choose(/^Category/, /^Networking/)
    expect(screen.getByRole('button', { name: 'Open Base Philadelphia' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Goldie' })).toBeNull()
    await user.type(screen.getByLabelText('Find a place by name'), 'gold')
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
    const eruv = { id: 'cc', name: 'Center City Eruv', covers: 'Center City', website: null, hotline: null, alertsUrl: null, statusUrl: null, statusDated: false, status: null, statusWords: null, statusPostedOn: null, statusCheckedAt: null, statusErrorAt: null, statusError: null, lineUrl: null, active: true, rawLine: null, lineReadAt: null, lineError: null, lineLeaveOut: [], lineHidePoints: false, lineMissing: [], statusEmail: null, statusEmailKept: null, updatedAt: day }
    const posted: unknown[] = []
    function renderEruvs(shown: typeof eruv = eruv, page = eruvCategory) {
      vi.mocked(fetchJson).mockImplementation(async (url, init) => {
        if (init?.method) {
          const body = JSON.parse(String(init.body))
          posted.push(body)
          return { ok: true, eruv: { ...eruv, id: 'new-eruv', name: body.name } }
        }
        if (String(url).includes('/api/admin/listings')) return { ok: true, places, categories: [...categories, page] }
        if (String(url).includes('/api/admin/categories')) return { ok: true, categories: [...categories, page] }
        if (String(url).includes('/api/admin/watches/eruv')) return { available: true, timezone: 'America/New_York', eruvim: [shown], findings: [], watches: [] }
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

    // Nov 9: the Eruv page no longer lists eruvim, so what only an eruv has,
    // which parts of its map show and whether its markers do, is its Map row.
    // Its line colour and its order aren't an admin's any more.
    it('its Map row shows the map, its parts and its markers, saved with Update the listing', async () => {
      const rawLine = {
        lines: [
          { name: 'Boundary', points: [[39.95, -75.19], [39.96, -75.18]] as [number, number][], color: '#ccffff' },
          { name: 'Driving directions', points: [[39.95, -75.19], [39.94, -75.18]] as [number, number][] },
        ],
        marks: [{ name: 'A shul', at: [39.955, -75.185] as [number, number] }],
      }
      const user = userEvent.setup()
      renderEruvs({ ...eruv, lineUrl: 'https://www.google.com/maps/d/viewer?mid=abc' as never, rawLine: rawLine as never, lineLeaveOut: ['Driving directions'] as never })
      await user.click(await screen.findByRole('button', { name: 'Open Center City Eruv' }))
      await user.click(await screen.findByTestId('editor-row-map'))
      const open = screen.getByTestId('editor-open-map')
      expect(within(open).getByTestId('eruv-map-preview')).toBeInTheDocument()
      expect(within(open).getByRole('checkbox', { name: 'Boundary' })).toBeChecked()
      expect(within(open).getByRole('checkbox', { name: 'Driving directions' })).not.toBeChecked()
      expect(within(open).getByRole('checkbox', { name: 'Its markers' })).toBeChecked()
      // A marker is a part too, until its markers are hidden.
      expect(within(open).getByRole('checkbox', { name: 'A shul' })).toBeChecked()
      expect(within(open).queryByText(/colour|Order/i)).toBeNull()
      // Its pale line drawn darker in the preview, as on the site.
      expect(within(open).getByTestId('eruv-map-preview').querySelector('polyline')?.getAttribute('stroke')).toBe('#b7372d')

      await user.click(within(open).getByRole('checkbox', { name: 'Driving directions' }))
      await user.click(within(open).getByRole('checkbox', { name: 'Its markers' }))
      expect(within(open).queryByRole('checkbox', { name: 'A shul' })).toBeNull()
      await user.click(screen.getByRole('button', { name: 'Update the listing' }))
      await waitFor(() => expect(posted).toEqual([{ action: 'save', id: 'cc', edit: { lineLeaveOut: [], lineHidePoints: true } }]))
    })

    it('an eruv with no map read yet has nothing to choose in its Map row', async () => {
      const user = userEvent.setup()
      renderEruvs()
      await user.click(await screen.findByRole('button', { name: 'Open Center City Eruv' }))
      await user.click(await screen.findByTestId('editor-row-map'))
      expect(screen.queryByTestId('eruv-map-preview')).toBeNull()
      expect(screen.queryByRole('checkbox', { name: 'Its markers' })).toBeNull()
      expect(screen.getByRole('button', { name: 'No changes yet' })).toBeDisabled()
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

    // Item 95 (Nov 28): its status and map are given in their rows, as a
    // place's sources are, kept by Done; no screen over them. Its status can
    // be an email; its map only a page.
    it('Add a place: its status and map are given in their rows, kept by Done', async () => {
      const user = userEvent.setup()
      renderEruvs()
      await screen.findByRole('button', { name: 'Open Center City Eruv' })
      await choose(/^Category/, /^Eruv/)
      await user.click(screen.getByRole('button', { name: /Add a place/ }))
      await user.click(await screen.findByTestId('editor-row-name'))
      await user.type(screen.getByLabelText('Name'), 'New Eruv')
      await user.click(screen.getByRole('button', { name: 'Done' }))

      await user.click(screen.getByTestId('editor-add-map'))
      await user.click(screen.getByRole('button', { name: 'Add a page' }))
      await user.type(screen.getByTestId('source-field'), 'eruv@ccEruv.org')
      await user.click(screen.getByRole('button', { name: 'Done' }))
      expect(screen.getByTestId('editor-open-map')).toHaveTextContent('This takes a page’s link, not an email')
      await user.clear(screen.getByTestId('source-field'))
      await user.click(screen.getByRole('button', { name: 'Done' }))

      await user.click(screen.getByTestId('editor-add-status'))
      expect(screen.queryByRole('heading', { name: 'Add a source' })).toBeNull()
      await user.click(screen.getByRole('button', { name: 'Add a page or an email' }))
      await user.type(screen.getByTestId('source-field'), 'eruv@cceruv.org')
      expect(screen.getByTestId('source-field-email')).toHaveTextContent('Sign up with the guide’s email to get its emails')
      await user.click(screen.getByRole('button', { name: 'Done' }))
      await waitFor(() => expect(screen.queryByTestId('editor-open-status')).toBeNull())
      expect(screen.getByTestId('editor-row-status')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Add listing' }))
      await waitFor(() => expect(posted).toEqual([{ action: 'add', name: 'New Eruv' }, { action: 'save', id: 'new-eruv', edit: { statusEmail: 'eruv@cceruv.org' } }]))
    })

    // The user, Nov 9: a field made on the Eruv page is filled in while
    // adding an eruv, not only in Places after.
    it('Add a place has a row for each field made on the Eruv page, and adds what it holds', async () => {
      const user = userEvent.setup()
      const page = { ...eruvCategory, detailFields: [
        { key: 'covers', label: 'Where it goes', type: 'textarea' },
        { key: 'certifiedBy', label: 'Certified by', type: 'text' },
        { key: 'checkedWeekly', label: 'Checked every week', type: 'boolean' },
      ] } as never
      renderEruvs(eruv, page)
      await screen.findByRole('button', { name: 'Open Center City Eruv' })
      await choose(/^Category/, /^Eruv/)
      await user.click(screen.getByRole('button', { name: /Add a place/ }))
      expect(await screen.findByTestId('editor-empty')).toHaveTextContent('Certified by')
      await user.click(screen.getByTestId('editor-row-name'))
      await user.type(screen.getByLabelText('Name'), 'New Eruv')
      await user.click(screen.getByTestId('editor-add-own-certifiedBy'))
      await user.type(screen.getByLabelText('Certified by'), 'Rabbi A')
      await user.click(screen.getByRole('button', { name: 'Add listing' }))
      await waitFor(() => expect(posted).toEqual([{ action: 'add', name: 'New Eruv' }, { action: 'save', id: 'new-eruv', edit: { details: { certifiedBy: 'Rabbi A' } } }]))
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
    // Board U2 (Nov 26): the categories as rows, a tap goes on; no menu, no Next.
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Map' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Food' }))
    expect(screen.getByRole('heading', { name: 'Add to Food' })).toBeInTheDocument()
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
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
  // Nov 9: each a page of its own to the browser, with its own address.
  const here = () => window.location.pathname + window.location.search
  const pop = (url: string) =>
    act(() => {
      window.history.replaceState({}, '', url)
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
    })

  it('swiping back lands on the list, as the place is an entry in the history with its own address', async () => {
    const user = userEvent.setup()
    renderPlaces()
    const before = window.history.length
    await user.click(await screen.findByRole('button', { name: 'Open Goldie' }))
    expect(screen.getByRole('heading', { name: 'Goldie' })).toBeInTheDocument()
    await waitFor(() => expect(here()).toBe('/philly/admin/places?place=goldie'))
    expect(window.history.length).toBe(before + 1)
    pop('/philly/admin/places')
    expect(await screen.findByRole('region', { name: 'Places' })).toBeInTheDocument()
    // Forward.
    pop('/philly/admin/places?place=goldie')
    expect(await screen.findByRole('heading', { name: 'Goldie' })).toBeInTheDocument()
  })

  // Board U2 (Nov 26): each step of Add is an entry, so Back steps through
  // them, and once it's added it's back on the list, over both.
  it('Add’s steps are entries: Back from finding it is What are you adding?, then the list', async () => {
    const user = userEvent.setup()
    renderPlaces()
    const before = window.history.length
    await user.click(await screen.findByRole('button', { name: 'Add a place' }))
    await waitFor(() => expect(here()).toBe('/philly/admin/places?add='))
    await user.click(screen.getByRole('button', { name: 'Food' }))
    await waitFor(() => expect(here()).toBe('/philly/admin/places?add=food&from=pick'))
    expect(window.history.length).toBe(before + 2)
    pop('/philly/admin/places?add=')
    expect(await screen.findByRole('heading', { name: 'What are you adding?' })).toBeInTheDocument()
    pop('/philly/admin/places')
    expect(await screen.findByRole('region', { name: 'Places' })).toBeInTheDocument()
    pop('/philly/admin/places?add=food&from=pick')
    expect(await screen.findByRole('heading', { name: 'Add to Food' })).toBeInTheDocument()
  })

  // Seen in a real browser, Nov 26: the screen's own Back went over both,
  // to the list, as it read the address before the router had written it.
  it('Find’s own Back is What are you adding?', async () => {
    const user = userEvent.setup()
    renderPlaces()
    await user.click(await screen.findByRole('button', { name: 'Add a place' }))
    await user.click(screen.getByRole('button', { name: 'Food' }))
    await screen.findByRole('heading', { name: 'Add to Food' })
    const go = vi.spyOn(window.history, 'go').mockImplementation((n = 0) => {
      expect(n).toBe(-1)
      pop('/philly/admin/places?add=')
    })
    await user.click(screen.getAllByRole('button', { name: /Back/ })[0])
    expect(await screen.findByRole('heading', { name: 'What are you adding?' })).toBeInTheDocument()
    go.mockRestore()
  })

  it('a reload on What are you adding? opens it', async () => {
    window.history.replaceState(null, '', '/philly/admin/places?add=')
    renderPlaces()
    expect(await screen.findByRole('heading', { name: 'What are you adding?' })).toBeInTheDocument()
  })

  it('a reload on a place opens it', async () => {
    window.history.replaceState(null, '', '/philly/admin/places?place=goldie')
    renderPlaces()
    expect(await screen.findByRole('heading', { name: 'Goldie' })).toBeInTheDocument()
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
