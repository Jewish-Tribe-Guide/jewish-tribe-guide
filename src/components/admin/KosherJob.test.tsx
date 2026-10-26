// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { Watch } from '@/lib/watches'
import type { KosherPlace } from '@/lib/kosherJob'
import type { Finding } from '@/lib/watchFindings'
import KosherJob, { type KosherListState, type KosherLoaded } from './KosherJob'
import { day } from './JobPage'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/watches/kosher',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const NOW = Date.now()
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()
const READ = ago(0.1)
const today = () => day(new Date().toISOString())
const watch = (over: Partial<Watch>): Watch =>
  ({ id: 'w', communityId: 'philly', kind: 'website', url: 'https://x', active: true, lastRunAt: READ, lastOkAt: READ, lastError: null, failingSince: null, lastCheck: null, ...over }) as Watch

const KEYSTONE: KosherListState = {
  list: 'keystone',
  url: 'https://keystone-k.org/establishments/',
  watch: watch({ id: 'k', kind: 'keystone_list', url: 'https://keystone-k.org/establishments/' }),
  error: null,
  entries: 78,
  updated: null,
}
const MEKOR: KosherListState = {
  list: 'mekor',
  url: 'https://www.mekorhabracha.org/center-city',
  watch: watch({ id: 'm', url: 'https://www.mekorhabracha.org/center-city' }),
  error: null,
  entries: 52,
  updated: '2026-10-12',
}

// As dev's restaurants are set up (Oct 22).
const RESTAURANT = makeCategory({
  id: 'restaurant',
  label: 'Food',
  detailFields: [
    { key: 't', label: 'Food Type', type: 'select', renderAs: 'badge', options: ['Meat', 'Dairy', 'Parve'].map((v) => ({ label: v, value: v })) },
    {
      key: 'kosherCert',
      label: 'Kosher Certification',
      type: 'select',
      renderAs: 'badge',
      caveat: { flagField: 'kosherPartial', noteField: 'kosherNote' },
      options: ['IKC', 'Keystone-K', 'Cherry-K'].map((v) => ({ label: v, value: v })),
    },
    { key: 'kosherPartial', label: 'Everything here is kosher', type: 'boolean', renderAs: 'hidden', invertDisplay: true },
    { key: 'kosherNote', label: 'What isn’t kosher?', type: 'textarea', renderAs: 'hidden' },
    { key: 'foodType', label: 'Store Type', type: 'select', renderAs: 'badge', options: ['Restaurant', 'Bakery', 'Catering', 'Ice Cream & Treats'].map((v) => ({ label: v, value: v })) },
    { key: 'k', label: 'Kosher Certification URL', type: 'url', renderAs: 'row' },
    { key: 'website', label: 'Website', type: 'url', renderAs: 'row' },
  ],
} as never)

type F = Finding & { address?: string; category?: string }
const finding = (over: Partial<F> = {}): F => ({
  id: 's',
  operation: 'update',
  targetId: null,
  name: '',
  from: 'Keystone-K’s list',
  says: 'Keystone-K says',
  named: 'Keystone-K',
  at: READ,
  notes: [],
  lines: [],
  ...over,
})

type P = KosherPlace & { href: string; box?: Record<string, unknown>; findings?: F[]; decided?: { at: string; status: 'approved' | 'rejected' } | null }
const place = (over: Partial<P>): P => ({ id: 'p', name: 'Somewhere', category: 'restaurant', certs: [], levels: [], on: [], differences: [], href: '/philly/restaurant/somewhere-p', ...over })

const TWISTERS_PAGE = 'https://keystone-k.org/kosher/tasty-twisters-soft-pretzel-factory/'
const TWISTERS_BOX = { kosherCert: ['Keystone-K'], k: TWISTERS_PAGE, kosherPartial: true, kosherNote: 'Only plain/salt pretzels are kosher' }
// Board 1: the list adds meat, dairy or parve.
const TWISTERS = place({
  id: 'twisters',
  name: 'Tasty Twisters Bakery',
  certs: ['Keystone-K'],
  on: [{ list: 'keystone', name: 'Tasty Twisters', url: TWISTERS_PAGE, says: 'Parve' }],
  differences: [{ list: 'keystone', line: 'Keystone-K says Parve; the listing says neither meat, dairy nor parve', filed: 'queued' }],
  box: TWISTERS_BOX,
  findings: [
    finding({
      id: 's-twisters',
      targetId: 'twisters',
      lines: [{ key: 't', label: 'Food Type', before: '—', after: 'Parve', choosable: true }],
      values: { ...TWISTERS_BOX, t: ['Parve'], kosherNote: 'Only Plain/Salt Pretzels are kosher', website: 'https://tastytwisters.com' },
    }),
  ],
})
// Board 3: its only hechsher gone, and the list has a place by a near name.
const BBQ_NOTE = `Not on Keystone-K's list of the places it certifies today: https://keystone-k.org/establishments/\nKeystone-K was its only certification, so approving removes the listing (archived, it can be restored). Rejecting keeps it.\nThe list does have "Kosher City Eats" (https://keystone-k.org/kosher/kosher-city-eats/). The same business under a new name?`
const BBQ = place({
  id: 'bbq',
  name: 'The Brazilian BBQ',
  certs: ['Keystone-K'],
  differences: [{ list: 'keystone', line: 'Not on Keystone-K’s list any more, and Keystone-K is its only hechsher', filed: 'queued' }],
  box: { kosherCert: ['Keystone-K'], k: 'https://keystone-k.org/kosher/rio-kosher-by-brazilian-kosher/' },
  findings: [finding({ id: 's-bbq', operation: 'delete', targetId: 'bbq', notes: [BBQ_NOTE] })],
})
const CHERRY = place({
  id: 'cherry',
  name: 'Cherry Grill',
  certs: ['Keystone-K'],
  levels: ['Meat'],
  on: [{ list: 'keystone', name: 'Cherry Grill', url: 'https://keystone-k.org/kosher/cherry-grill/', says: 'Meat' }],
  box: { kosherCert: ['Keystone-K'], t: ['Meat'], k: 'https://keystone-k.org/kosher/cherry-grill/' },
})
const STAR = place({ id: 'star', name: 'Star K Place', certs: ['Star-K'], box: { kosherCert: ['Star-K'] } })
// Board 4: new on a list.
const RIVKA = {
  name: 'Rivka Cakes',
  address: '198 Tomlinson Rd, Philadelphia PA 19116',
  on: [{ list: 'keystone' as const, name: 'Rivka Cakes', url: 'https://keystone-k.org/kosher/rivka-cakes/', says: 'Parve' }],
  archived: null, archivedId: null,
  filed: 'queued' as const,
  findings: [
    finding({
      id: 's-rivka',
      operation: 'create',
      name: 'Rivka Cakes',
      address: '198 Tomlinson Rd, Philadelphia PA 19116',
      category: 'restaurant',
      notes: ['On Keystone-K’s list, not in the guide.\nKeystone-K\'s list says: "Rivka Cakes"\nGoogle: open, as Rivka Cakes.'],
      values: { kosherCert: ['Keystone-K'], t: ['Parve'], k: 'https://keystone-k.org/kosher/rivka-cakes/', foodType: 'Bakery' },
    }),
  ],
}

const posts: { url: string; body: Record<string, unknown> }[] = []
async function renderPage(over: Partial<KosherLoaded> = {}) {
  let loads = 0
  const data: KosherLoaded = {
    available: true,
    categories: [RESTAURANT],
    lists: [KEYSTONE, MEKOR],
    counts: { checked: 1, toCheck: 3, cantRead: 0, didntLoad: 0, notListed: 1 },
    places: [BBQ, CHERRY, STAR, TWISTERS],
    newPlaces: [RIVKA],
    ...over,
  }
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    if (init?.method === 'POST' || init?.method === 'PATCH') {
      posts.push({ url: String(url), body: JSON.parse(String(init.body)) })
      return { ok: true }
    }
    loads += 1
    return { ok: true, ...data }
  })
  renderWithProviders(<KosherJob token="tok" />, { community: { slug: 'philly' } })
  await screen.findByTestId('job-counts')
  return { loads: () => loads }
}
const rows = () => screen.getAllByTestId('job-row')
const rowOf = (name: string) => rows().find((r) => within(r).queryAllByText(name).length) as HTMLElement
const pill = (name: string) => within(rowOf(name)).getByTestId('job-status').textContent
/** On the tab showing. */
const shown = (name: string) => screen.queryAllByTestId('job-row').some((r) => within(r).queryAllByText(name).length > 0)
const open = (name: string) => userEvent.setup().click(within(rowOf(name)).getAllByRole('button')[0])
const tab = (name: string) => userEvent.setup().click(screen.getByRole('tab', { name: new RegExp(`^${name} \\d+$`) }))
const placeOf = (name: string) => screen.getByRole('region', { name })
const boxList = (name: string) => within(placeOf(name)).getAllByRole('region').map((b) => `${b.getAttribute('aria-label')} | ${within(b).queryByTestId('box-pill')?.textContent ?? ''} | ${within(b).getAllByRole('button')[0].getAttribute('aria-expanded')}`)
const box = (name: string, label: string) => within(placeOf(name)).getByRole('region', { name: label })
const marked = (b: HTMLElement) => within(b).getAllByTestId('box-row').map((r) => `${r.dataset.mark}: ${r.textContent}`)

afterEach(() => {
  posts.length = 0
  cleanup()
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

describe('Kosher certification', () => {
  it('says at the top whether a place has an update from a list; the two lists, each with its switch; four tabs', async () => {
    await renderPage()
    expect(screen.getByTestId('job-counts').textContent).toBe('2 places have an update from a list.')
    const lists = screen.getByRole('region', { name: 'Lists' })
    expect(within(lists).getByTestId('box-pill').textContent).toBe('2 lists')
    expect(within(lists).getAllByTestId('kosher-list').map((l) => l.textContent)).toEqual([
      `keystone-k.org/establishmentsKeystone-K’s listread ${day(READ)}Reading`,
      `mekorhabracha.org/center-cityMekor Habracha’s list · updated Oct 12read ${day(READ)}Reading`,
    ])
    expect(within(lists).getAllByRole('switch').map((s) => s.getAttribute('aria-checked'))).toEqual(['true', 'true'])
    expect(within(lists).getByRole('button', { name: 'Read them now' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['To check 2', 'New on a list 1', 'Checked 1', 'On neither list 1'])
    expect(rows().map((r) => `${within(r).getAllByRole('button')[0].textContent}`)).toEqual(['The Brazilian BBQ1 update›', 'Tasty Twisters Bakery1 update›'])
    expect(screen.getByRole('link', { name: '‹ Watches' })).toHaveAttribute('href', '/philly/admin/watches')
  })

  it('opened: the listing’s Kosher box, a new value only highlighted, what isn’t kosher by being there; Use this, Edit, Keep; then Reads with no switch', async () => {
    await renderPage()
    await open(TWISTERS.name)
    expect(boxList(TWISTERS.name)).toEqual(['Kosher | 1 new | true', 'Reads | 1 page | false'])
    const b = box(TWISTERS.name, 'Kosher')
    expect(marked(b)).toEqual([
      'same: HechsherKeystone-K',
      'new: Meat, dairy or parveParve',
      'same: Certificatekeystone-k.org/kosher/tasty-twisters-soft-pretzel-factory',
      // The list's wording differs; the listing's stays.
      'same: What isn’t kosher?Only plain/salt pretzels are kosher',
    ])
    expect(within(b).getAllByRole('button').slice(1).map((x) => x.textContent)).toEqual(['Use this', 'Edit', 'Keep the listing'])
    expect(within(b).getByTestId('box-source').textContent).toBe(`From Keystone-K’s list · read ${day(READ)}`)
    expect(within(b).getByRole('link', { name: 'Keystone-K’s list' })).toHaveAttribute('href', KEYSTONE.url)
    const reads = box(TWISTERS.name, 'Reads')
    await userEvent.setup().click(within(reads).getAllByRole('button')[0])
    expect(within(reads).queryByRole('switch')).toBeNull()
    expect(within(reads).getByTestId('job-source').textContent).toBe(`keystone-k.org/kosher/tasty-twisters-soft-pretzel-factoryKeystone-K’s list · Kosherread ${day(READ)}`)
    expect(within(reads).getAllByRole('button').slice(1).map((x) => x.textContent)).toEqual(['Add a page', 'Read them now'])
    expect(within(reads).getByRole('link', { name: 'Open its listing' })).toHaveAttribute('href', TWISTERS.href)
  })

  it('Use this takes only what the box would change; Keep the listing rejects it; either says so where it was', async () => {
    await renderPage({ places: [TWISTERS, { ...TWISTERS, id: 'two', name: 'Two', findings: [{ ...TWISTERS.findings![0], id: 's-two', targetId: 'two' }] }] })
    const user = userEvent.setup()
    await open(TWISTERS.name)
    await user.click(within(box(TWISTERS.name, 'Kosher')).getByRole('button', { name: 'Use this' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/submissions/s-twisters?community=philly', body: { status: 'approved', only: ['t'] } })
    // Nothing left to decide: straight to Checked (the user, Oct 22).
    expect(shown(TWISTERS.name)).toBe(false)
    await open('Two')
    await user.click(within(box('Two', 'Kosher')).getByRole('button', { name: 'Keep the listing' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/submissions/s-two?community=philly', body: { status: 'rejected' } })
    expect(shown('Two')).toBe(false)
    await tab('Checked')
    expect(pill('Two')).toBe(`Kept ${today()}`)
    expect(pill(TWISTERS.name)).toBe(`Used ${today()}`)
    await open(TWISTERS.name)
    expect(within(box(TWISTERS.name, 'Kosher')).getByTestId('box-pill').textContent).toBe(`Used ${today()}`)
    expect(within(box(TWISTERS.name, 'Kosher')).queryByRole('button', { name: 'Use this' })).toBeNull()
  })

  it('a finding the listing already agrees with is Same, and Use this still takes only its own lines', async () => {
    await renderPage({ places: [{ ...TWISTERS, box: { ...TWISTERS_BOX, t: ['Parve'] } }] })
    await open(TWISTERS.name)
    const b = box(TWISTERS.name, 'Kosher')
    expect(within(b).getByTestId('box-pill').textContent).toBe('Same')
    await userEvent.setup().click(within(b).getByRole('button', { name: 'Use this' }))
    // Never the whole finding: its other values are as the listing was then.
    expect(posts.at(-1)!.body).toEqual({ status: 'approved', only: ['t'] })
  })

  // Board 5: the listing's own Edit for its Kosher box, filled in with the
  // list's version.
  it('Edit: the listing’s Kosher box, filled with the list’s, saved onto the listing as it is now', async () => {
    const item = makeListing({ id: 'twisters', category: 'restaurant', name: TWISTERS.name, ...TWISTERS_BOX, website: 'https://now.example' } as never)
    await renderPage()
    const listed = vi.mocked(fetchJson).getMockImplementation()!
    vi.mocked(fetchJson).mockImplementation(async (url, init, fallback) => (String(url).includes('item=twisters') ? { ok: true, item, category: RESTAURANT } : listed(url, init, fallback)))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await open(TWISTERS.name)
    const user = userEvent.setup()
    await user.click(within(box(TWISTERS.name, 'Kosher')).getByRole('button', { name: 'Edit' }))
    expect(vi.mocked(fetchJson).mock.calls.map(([u]) => u)).toContain('/api/admin/watches/kosher?item=twisters&community=philly')
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByDisplayValue('Only Plain/Salt Pretzels are kosher')).toBeInTheDocument()
    expect(within(sheet).queryByDisplayValue('https://now.example')).toBeNull()
    await user.click(within(sheet).getByRole('button', { name: 'Save to the listing' }))
    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/api/admin/submissions/'))!
    expect(String(url)).toBe('/api/admin/submissions/s-twisters?community=philly')
    const sent = JSON.parse(String(init!.body))
    expect(sent.status).toBe('approved')
    // The box as edited; everything else as the listing has it now, not
    // as it was when the list was read.
    expect(sent.payload.details).toMatchObject({ t: ['Parve'], kosherCert: ['Keystone-K'], kosherNote: 'Only Plain/Salt Pretzels are kosher', website: 'https://now.example' })
    expect(sent.payload.name).toBe(TWISTERS.name)
    await waitFor(() => expect(shown(TWISTERS.name)).toBe(false))
    await tab('Checked')
    expect(pill(TWISTERS.name)).toBe(`Used ${today()}`)
  })

  // Board 3.
  it('its only hechsher gone: crossed out, No hechsher left, Archive the listing; and the near name, offered as one link', async () => {
    await renderPage()
    await open(BBQ.name)
    const b = box(BBQ.name, 'Kosher')
    expect(within(b).getByTestId('box-pill').textContent).toBe('Not on Keystone-K’s list')
    expect(marked(b)).toEqual(['gone: Keystone-KHechsher', 'gone: keystone-k.org/kosher/rio-kosher-by-brazilian-kosherCertificate'])
    expect(within(b).getByText('Keystone-K').closest('.line-through')).not.toBeNull()
    expect(within(b).getByText('No hechsher left')).toBeInTheDocument()
    expect(within(b).getAllByRole('button').slice(1).map((x) => x.textContent)).toEqual(['Archive the listing', 'Edit', 'Keep the listing', 'It’s Kosher City Eats now'])
    const user = userEvent.setup()
    await user.click(within(b).getByRole('button', { name: 'Archive the listing' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/submissions/s-bbq?community=philly', body: { status: 'approved' } })
    expect(shown(BBQ.name)).toBe(false)
    await tab('Checked')
    expect(pill(BBQ.name)).toBe(`Archived ${today()}`)
  })

  it('It’s … now renames the listing onto the list’s entry', async () => {
    await renderPage()
    await open(BBQ.name)
    await userEvent.setup().click(within(box(BBQ.name, 'Kosher')).getByRole('button', { name: 'It’s Kosher City Eats now' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/watches/kosher?community=philly', body: { action: 'renamed', id: 's-bbq' } })
    expect(shown(BBQ.name)).toBe(false)
    await tab('Checked')
    expect(pill(BBQ.name)).toBe(`Renamed ${today()}`)
  })

  it('an edit that leaves no hechsher offers Archive the listing too, from either list', async () => {
    const only = place({
      id: 'ikc',
      name: 'IKC Only',
      certs: ['IKC'],
      box: { kosherCert: ['IKC'] },
      findings: [finding({ id: 's-ikc', from: 'Mekor Habracha’s list', targetId: 'ikc', lines: [{ key: 'kosherCert', label: 'Kosher Certification', before: 'IKC', after: '—', choosable: true, empties: true }], values: { kosherCert: [] } })],
    })
    await renderPage({ places: [only] })
    await open('IKC Only')
    const b = box('IKC Only', 'Kosher')
    expect(within(b).getByText('No hechsher left')).toBeInTheDocument()
    expect(within(b).queryByRole('button', { name: /now$/ })).toBeNull()
    await userEvent.setup().click(within(b).getByRole('button', { name: 'Archive the listing' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/watches/kosher?community=philly', body: { action: 'archive', id: 's-ikc' } })
    expect(within(b).getByTestId('box-source').textContent).toBe(`From Mekor Habracha’s list · read ${day(READ)}`)
  })

  // Board 4.
  it('new on a list: the listing it would add, Google’s word on it; Add it, Edit, Leave it out', async () => {
    await renderPage()
    await tab('New on a list')
    expect(pill('Rivka Cakes')).toBe('New')
    await open('Rivka Cakes')
    expect(boxList('Rivka Cakes')).toEqual(['Place | New | true', 'Kosher | New | true'])
    const p = box('Rivka Cakes', 'Place')
    expect(marked(p)).toEqual(['new: Rivka Cakes198 Tomlinson Rd, Philadelphia PA 19116Food'])
    expect(within(p).getByText('Google: open, as Rivka Cakes')).toBeInTheDocument()
    const k = box('Rivka Cakes', 'Kosher')
    expect(marked(k)).toEqual(['new: HechsherKeystone-K', 'new: Meat, dairy or parveParve', 'new: Certificatekeystone-k.org/kosher/rivka-cakes'])
    expect(within(k).getAllByRole('button').slice(1).map((x) => x.textContent)).toEqual(['Add it', 'Edit', 'Leave it out'])
    const user = userEvent.setup()
    await user.click(within(k).getByRole('button', { name: 'Leave it out' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/submissions/s-rivka?community=philly', body: { status: 'rejected' } })
    // Decided: off the page.
    expect(shown('Rivka Cakes')).toBe(false)
    expect(screen.getByRole('tab', { name: 'New on a list 0' })).toBeInTheDocument()
  })

  // Oct 25 (the user): "A new place the guide archived has no way to bring
  // it back."
  it('a new place the guide has archived: Bring it back restores it and closes the new place', async () => {
    const { loads } = await renderPage({ newPlaces: [{ ...RIVKA, archived: 'Rivka’s Cakes', archivedId: 'rivka-old' }] })
    await tab('New on a list')
    await open('Rivka Cakes')
    const p = box('Rivka Cakes', 'Place')
    expect(within(p).getByText('The guide has it archived, as “Rivka’s Cakes”.')).toBeInTheDocument()
    const before = loads()
    await userEvent.setup().click(within(p).getByRole('button', { name: 'Bring it back' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/watches/kosher?community=philly', body: { action: 'restore', resourceId: 'rivka-old', id: 's-rivka' } })
    await waitFor(() => expect(loads()).toBeGreaterThan(before))
  })

  it('a new place left out before isn’t shown again', async () => {
    await renderPage({ newPlaces: [{ ...RIVKA, filed: 'decided', findings: [] }] })
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toContain('New on a list 0')
  })

  it('Edit on a new place: the whole new-listing editor, filled in, Add it saving it', async () => {
    await renderPage()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await tab('New on a list')
    await open('Rivka Cakes')
    const user = userEvent.setup()
    await user.click(within(box('Rivka Cakes', 'Kosher')).getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('heading', { name: 'Rivka Cakes' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add it' }))
    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/api/admin/submissions/'))!
    expect(String(url)).toBe('/api/admin/submissions/s-rivka?community=philly')
    const sent = JSON.parse(String(init!.body))
    expect(sent).toMatchObject({ status: 'approved', payload: { name: 'Rivka Cakes', address: '198 Tomlinson Rd, Philadelphia PA 19116' } })
    expect(sent.payload.details).toMatchObject({ kosherCert: ['Keystone-K'], t: ['Parve'], k: 'https://keystone-k.org/kosher/rivka-cakes/' })
  })

  it('a finding wider than the Kosher box shows whole, with Compare', async () => {
    const wide = { ...TWISTERS, findings: [{ ...TWISTERS.findings![0], lines: [...TWISTERS.findings![0].lines, { key: 'website', label: 'Website', before: '—', after: 'tastytwisters.com', choosable: true }] }] }
    await renderPage({ places: [wide] })
    await open(TWISTERS.name)
    expect(boxList(TWISTERS.name)).toEqual(['From Keystone-K’s list | 2 updates | true', 'Reads | 1 page | false'])
    expect(within(box(TWISTERS.name, 'From Keystone-K’s list')).getByTestId('finding')).toBeInTheDocument()
  })

  it('checked: Same, as the list has it; decided before says when; on neither list says its hechsher', async () => {
    await renderPage({ newPlaces: [], places: [CHERRY, { ...CHERRY, id: 'old', name: 'Old News', differences: [{ list: 'keystone', line: 'x', filed: 'decided' }], decided: { at: ago(3), status: 'rejected' } }, STAR] })
    expect(screen.getAllByRole('tab', { selected: true })[0].textContent).toBe('Checked 2')
    expect(pill('Cherry Grill')).toBe('Same')
    expect(pill('Old News')).toBe(`Kept ${day(ago(3))}`)
    await open('Cherry Grill')
    const b = box('Cherry Grill', 'Kosher')
    await userEvent.setup().click(within(b).getAllByRole('button')[0])
    expect(within(b).getByTestId('box-source').textContent).toBe('Same as Keystone-K’s list')
    await tab('On neither list')
    expect(pill('Star K Place')).toBe('Star-K')
  })

  it('not filed yet: says so, with what the list says, until it’s read', async () => {
    await renderPage({ places: [{ ...TWISTERS, findings: [], differences: [{ ...TWISTERS.differences[0], filed: 'next' }] }] })
    expect(pill(TWISTERS.name)).toBe('Not read yet')
    await open(TWISTERS.name)
    expect(within(box(TWISTERS.name, 'Kosher')).getByText(TWISTERS.differences[0].line)).toBeInTheDocument()
  })

  it('Read them now reads each list that’s read, then the page again', async () => {
    const page = await renderPage({ lists: [KEYSTONE, { ...MEKOR, watch: { ...MEKOR.watch!, active: false } }] })
    await userEvent.setup().click(within(screen.getByRole('region', { name: 'Lists' })).getByRole('button', { name: 'Read them now' }))
    expect(posts.map((p) => p.body)).toEqual([{ action: 'check', id: 'k' }])
    expect(posts[0].url).toBe('/api/admin/watches?community=philly')
    expect(page.loads()).toBe(2)
  })

  it('a list’s switch pauses or resumes it; a list not read for this guide starts', async () => {
    await renderPage({ lists: [KEYSTONE, { ...MEKOR, watch: null, entries: null }] })
    const user = userEvent.setup()
    const [keystone, mekor] = screen.getAllByTestId('kosher-list')
    expect(within(mekor).getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    await user.click(within(keystone).getByRole('switch'))
    expect(posts.at(-1)!.body).toEqual({ action: 'pause', id: 'k' })
    await user.click(within(screen.getAllByTestId('kosher-list')[1]).getByRole('switch'))
    expect(posts.at(-1)!.body).toEqual({ action: 'add', purpose: 'kosher', url: MEKOR.url })
  })

  it('a list that didn’t load says so', async () => {
    await renderPage({ lists: [{ ...KEYSTONE, error: 'Keystone-K’s list answered 503', entries: null }, MEKOR] })
    expect(screen.getAllByTestId('kosher-list')[0]).toHaveTextContent('Keystone-K’s list · didn’t load')
  })

  it('Add a page: its page on Keystone-K’s list, saved, and the page loads again', async () => {
    const page = await renderPage({ places: [STAR] })
    await tab('On neither list')
    await open('Star K Place')
    const reads = box('Star K Place', 'Reads')
    const user = userEvent.setup()
    await user.click(within(reads).getByRole('button', { name: 'Add a page' }))
    await user.type(within(reads).getByRole('textbox', { name: 'Its page on Keystone-K’s list' }), 'keystone-k.org/kosher/star')
    await user.click(within(reads).getByRole('button', { name: 'Save' }))
    expect(posts.at(-1)).toEqual({ url: '/api/admin/watches/kosher?community=philly', body: { action: 'page', resourceId: 'star', url: 'keystone-k.org/kosher/star' } })
    expect(page.loads()).toBe(2)
  })
})
