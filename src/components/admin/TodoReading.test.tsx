// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeListing } from '@/test/providerFixtures'
import { FOOD } from '@/test/editorFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import TodoReading, { lit, todoAnswerLabels } from './TodoReading'
import type { Jobs } from './useWatchJobs'
import { waitingAnswers } from './waitingAnswers'
import { ownGroups, type Decide, type WaitGroup, type WaitLine, type WaitRow } from './waitingGroups'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const group = (decide: Decide, lines: WaitLine[] = [], over: Partial<WaitGroup> = {}): WaitGroup => ({ key: 'k', job: 'google', page: null, when: null, lines, facts: [], note: null, decide, ...over })
const labels = (g: WaitGroup) => todoAnswerLabels(g, waitingAnswers(g.decide, 'p', { patch: vi.fn(), post: vi.fn() })).map((a) => a.label)

describe('todoAnswerLabels — a job’s reading in the change screens’ words', () => {
  it('one short line: Change to it, or Keep what the listing has', () => {
    expect(labels(group({ kind: 'google' }, [{ label: 'Phone', value: '215-555-0101', old: '215-555-0100' }]))).toEqual(['Change to 215-555-0101', 'Keep 215-555-0100', 'Wrong place'])
  })

  it('a long line, more than one, a new value or boxes: Update the listing, or Leave it', () => {
    const long = { label: 'Address', value: '1500 Walnut Street, Suite 200, Philadelphia', old: '1500 Walnut St' }
    const short = { label: 'Phone', value: '1', old: '2' }
    expect(labels(group({ kind: 'menu' }, [long]))).toEqual(['Update the listing', 'Leave it'])
    expect(labels(group({ kind: 'menu' }, [short, short]))).toEqual(['Update the listing', 'Leave it'])
    expect(labels(group({ kind: 'menu' }, [{ ...short, old: null }]))).toEqual(['Update the listing', 'Leave it'])
    expect(labels(group({ kind: 'menu' }, [short], { boxes: [{ name: 'Dishes', groups: [] }] }))).toEqual(['Update the listing', 'Leave it'])
  })

  it('a menu that only adds dishes says how many, and shows only those', () => {
    const dish = (name: string, mark: WaitRow['mark']): WaitRow => ({ name, mark })
    const menu = (...rows: WaitRow[]) => group({ kind: 'menu' }, [], { boxes: [{ name: 'Main dishes', groups: [{ rows }] }] })
    const two = menu(dish('Falafel', 'same'), dish('Hot Dogs', 'new'), dish('Deli', 'new'))
    expect(labels(two)).toEqual(['Add the 2 dishes', 'Don’t add them'])
    expect(lit(two.boxes![0]).map((r) => r.name)).toEqual(['Hot Dogs', 'Deli'])
    expect(labels(menu(dish('Falafel', 'same'), dish('Hot Dogs', 'new')))).toEqual(['Add the dish', 'Don’t add it'])
    expect(labels(menu(dish('Hot Dogs', 'new'), dish('Falafel', 'gone')))).toEqual(['Update the listing', 'Leave it'])
  })

  it('an archived place is added back to the guide; a closure keeps its own words', () => {
    expect(labels(group({ kind: 'later', archivedId: 'a' }))).toEqual(['Add to the guide'])
    expect(labels(group({ kind: 'closure' }))).toEqual(['Keep closed', 'Show as open'])
  })
})

describe('ownGroups — what To do decides on the place, not in the queue', () => {
  it('leaves out what is already a submission, and a later with nothing to bring back', () => {
    const kinds = (gs: WaitGroup[]) => ownGroups(gs).map((g) => g.decide.kind)
    const all = [
      group({ kind: 'findings', ids: ['s'] }),
      group({ kind: 'off', id: 's' }),
      group({ kind: 'archive', id: 's' }),
      group({ kind: 'new', id: 's' }),
      group({ kind: 'later' }),
      group({ kind: 'later', archivedId: 'a' }),
      group({ kind: 'google' }),
      group({ kind: 'closure' }),
      group({ kind: 'menu' }),
    ]
    expect(kinds(all)).toEqual(['later', 'google', 'closure', 'menu'])
  })
})

describe('waitingAnswers — what each answer sends', () => {
  it('Google’s go to its job with the place, a menu’s to main dishes, findings one PATCH each', async () => {
    const patch = vi.fn(async () => ({}))
    const post = vi.fn(async () => ({}))
    const [accept, keep, wrong] = waitingAnswers({ kind: 'google' }, 'p', { patch, post })
    await accept.work()
    await keep.work()
    await wrong.work()
    expect(post.mock.calls).toEqual([
      ['/api/admin/watches/google', { action: 'use', id: 'p' }],
      ['/api/admin/watches/google', { action: 'keep', id: 'p' }],
      ['/api/admin/watches/google', { action: 'wrong_place', id: 'p' }],
    ])
    post.mockClear()
    await waitingAnswers({ kind: 'menu' }, 'p', { patch, post })[0].work()
    expect(post.mock.calls).toEqual([['/api/admin/main-dishes', { action: 'use', resourceId: 'p' }]])
    await waitingAnswers({ kind: 'findings', ids: ['a', 'b'], only: { b: ['phone'] } }, 'p', { patch, post })[0].work()
    expect(patch.mock.calls).toEqual([
      ['a', { status: 'approved' }],
      ['b', { status: 'approved', only: ['phone'] }],
    ])
  })
})

// The user, Nov 4 (note 1): "Nothing bundt cakes read something bad. I want
// to edit that. I also want to re-run the source to see if it was right. I
// want to maybe change the source." A menu's reading on To do had only Add
// and Don't add; Places had Edit, Read now and Change.
describe('a menu’s reading on To do', () => {
  const cakes = makeListing({ id: 'nb', category: 'restaurant', name: 'Nothing Bundt Cakes', website: 'https://nothingbundtcakes.com', dishes: [] })
  const place = {
    id: 'nb',
    name: 'Nothing Bundt Cakes',
    href: '/x',
    website: 'https://nothingbundtcakes.com',
    menuUrl: null,
    dishes: [],
    reading: { status: 'proposed', readAt: '2026-10-22T07:00:00Z', sourceUrl: 'https://nothingbundtcakes.com/find-a-bakery/', dishes: [{ name: 'Bundt Cakes', quote: 'Bundt Cakes', checked: true }] },
  }
  const jobs = { categories: [], dishes: [place], hospitals: [], hours: null, times: null, sites: null, eruvim: null, kosher: null, links: null, google: { places: [] } } as unknown as Jobs

  function serve() {
    const sent: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') sent.push(JSON.parse(String(init.body)))
        const body = url.includes('watches/google?item=') ? { ok: true, item: cakes, category: FOOD } : { ok: true }
        return new Response(JSON.stringify(body), { status: 200 })
      }),
    )
    const reload = vi.fn(async () => {})
    renderWithProviders(<TodoReading placeId="nb" name="Nothing Bundt Cakes" jobs={jobs} token="tok" community="philly" position={{ at: 1, total: 1, back: () => {} }} switches={null} reload={reload} />)
    return { sent, reload, u: userEvent.setup() }
  }

  it('reads its menu again from where it was read', async () => {
    const { sent, reload, u } = serve()
    await u.click(screen.getByRole('button', { name: /find-a-bakery|Its menu/i }))
    await u.click(screen.getByRole('button', { name: 'Read it again' }))
    await waitFor(() => expect(reload).toHaveBeenCalled())
    expect(sent).toEqual([{ action: 'read', resourceId: 'nb' }])
  })

  it('takes a better menu page, and reads it', async () => {
    const { sent, reload, u } = serve()
    await u.click(screen.getByRole('button', { name: /find-a-bakery|Its menu/i }))
    await u.click(screen.getByRole('button', { name: 'Change' }))
    const box = screen.getByRole('textbox', { name: 'A link to its menu' })
    await u.clear(box)
    await u.type(box, 'https://nothingbundtcakes.com/cakes/')
    await u.click(screen.getByRole('button', { name: 'Read it' }))
    await waitFor(() => expect(reload).toHaveBeenCalled())
    expect(sent).toEqual([{ action: 'link', resourceId: 'nb', url: 'https://nothingbundtcakes.com/cakes/', background: true }])
  })

  it('edits the dishes before they’re added, and saves them as the menu’s', async () => {
    const { sent, reload, u } = serve()
    await u.click(screen.getByRole('button', { name: 'Edit' }))
    await u.type(within(await screen.findByTestId('items-editor')).getByRole('textbox'), 'Chocolate Chocolate Chip{Enter}')
    await u.click(screen.getByRole('button', { name: 'Save to the listing' }))
    await waitFor(() => expect(reload).toHaveBeenCalled())
    expect(sent).toEqual([{ action: 'save', resourceId: 'nb', always: ['Bundt Cakes', 'Chocolate Chocolate Chip'], sometimes: [] }])
  })
})
