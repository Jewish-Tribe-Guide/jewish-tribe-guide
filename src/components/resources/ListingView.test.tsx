// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import type { CategoryField } from '@/lib/categories'
import ListingView from './ListingView'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))
// Candle lighting comes from a fetch; nothing here is about Friday.
vi.mock('@/lib/useZmanim', () => ({ useZmanim: () => ({ data: null, status: 'idle' }) }))

afterEach(() => cleanup())

const hours: CategoryField = { key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row' }
const website: CategoryField = { key: 'website', label: 'Website', type: 'url', renderAs: 'row' }
const description: CategoryField = { key: 'googleDescription', label: 'Description', type: 'textarea', renderAs: 'row' }
const foodType: CategoryField = { key: 'foodType', label: 'Store Type', type: 'select', renderAs: 'badge', filterable: true }
const t: CategoryField = { key: 't', label: 'Food Type', type: 'select', renderAs: 'badge', filterable: true }
const cert: CategoryField = {
  key: 'kosherCert',
  label: 'Kosher Certification',
  type: 'select',
  renderAs: 'badge',
  filterable: true,
  caveat: { flagField: 'kosherPartial', noteField: 'kosherNote' },
}
const certLink: CategoryField = { key: 'k', label: 'Certificate', type: 'url', renderAs: 'row' }
const food = makeCategory({ id: 'restaurant', label: 'Food', pluralLabel: 'Food', detailFields: [hours, website, description, foodType, t, cert, certLink] })

const judah = makeListing({
  id: 'judah',
  name: 'Judah Mediterranean Grille',
  phone: '(215) 613-6110',
  website: 'http://judahgrill.com',
  k: 'https://keystone-k.org/judah',
  foodType: 'Restaurant',
  t: ['Meat'],
  kosherCert: 'Keystone-K',
  milesFromCenter: 11.24,
  googleDescription: 'Casual Middle Eastern cafe.',
  geo: { lat: 40.0856, lng: -75.0454 },
})

const view = (props: Partial<Parameters<typeof ListingView>[0]> = {}) =>
  renderWithProviders(<ListingView item={judah} category={food} color="#2657bf" path="/philly/restaurant/judah" foot={<p>foot</p>} {...props} />)

describe('ListingView — who and whether', () => {
  it('says what kind of place, where, and how far, then the deciding facts in the row’s words', () => {
    view({ place: 'Bustleton' })
    expect(screen.getByRole('heading', { name: 'Judah Mediterranean Grille' })).toBeInTheDocument()
    expect(screen.getByText(/Restaurant · Bustleton/)).toHaveTextContent('Restaurant · Bustleton · 11.2 mi from central')
    expect(screen.getByTestId('listing-facts')).toHaveTextContent('Meat · Keystone-K')
  })

  it('says a hechsher’s caveat under the facts, with what isn’t kosher', () => {
    view({ item: { ...judah, kosherPartial: true, kosherNote: 'The bar is not supervised' } })
    expect(screen.getByTestId('listing-caveat')).toHaveTextContent('Not everything here is kosher: The bar is not supervised')
  })

  it('says what isn’t kosher once: not again in About', () => {
    const note: CategoryField = { key: 'kosherNote', label: 'What isn’t kosher?', type: 'textarea', renderAs: 'hidden' }
    const withNote = makeCategory({ ...food, detailFields: [...food.detailFields, note] })
    view({ item: { ...judah, kosherPartial: true, kosherNote: 'The bar is not supervised' }, category: withNote })
    expect(screen.getAllByText(/The bar is not supervised/)).toHaveLength(1)
    expect(screen.getByTestId('listing-about')).not.toHaveTextContent('The bar is not supervised')
  })

  it('has no caveat line without one', () => {
    view()
    expect(screen.queryByTestId('listing-caveat')).not.toBeInTheDocument()
  })
})

describe('ListingView — actions', () => {
  it('Directions, Call, each link, then Share', () => {
    view()
    const labels = [...screen.getByTestId('listing-actions').querySelectorAll('a, button')].map((el) => el.textContent)
    expect(labels).toEqual(['Directions', 'Call', 'Website', 'Certificate', 'Share'])
  })
})

describe('ListingView — the main thing', () => {
  it('Food leads with the week’s hours, dated when Google keeps them', () => {
    view({ item: { ...judah, hours: { fri: { open: '11:00', close: '15:00' } }, placeId: 'p1', googleFields: ['hours'], googleSyncedAt: '2026-09-30T06:59:09Z' } })
    const card = screen.getByTestId('listing-hours')
    expect(card).toHaveTextContent('11 AM – 3 PM')
    expect(card).toHaveTextContent('From Google, updated Sep 30')
  })

  it('no Google date on hours Google doesn’t keep, or on a listing no longer matched to Google', () => {
    view({ item: { ...judah, hours: { fri: { open: '11:00', close: '15:00' } }, googleSyncedAt: '2026-09-30T06:59:09Z', googleFields: ['hours'] } })
    expect(screen.getByTestId('listing-hours')).not.toHaveTextContent('From Google')
  })

  const m: CategoryField = { key: 'm', label: 'Kosher items', type: 'tags', renderAs: 'badge', showCountInHeader: true, countReplacesKey: 'isKosher' }
  const grocery = makeCategory({ detailFields: [hours, m] })
  const tj = makeListing({ m: ['Marshmallows', 'Cheddar Cheese', 'Stew Meat', 'Chicken', 'Challah', 'Wine', 'Beef'], m_sometimes: ['Steak', 'Turkey'] })

  it('a grocery leads with its items, the not-always ones marked, six then all', () => {
    view({ item: tj, category: grocery })
    const card = screen.getByTestId('listing-items')
    expect(card).toHaveTextContent('Kosher items · 9')
    expect(within(card).getAllByRole('listitem')).toHaveLength(6)
    fireEvent.click(within(card).getByRole('button', { name: /All 9 items/ }))
    expect(within(card).getAllByRole('listitem')).toHaveLength(9)
    expect(within(card).getByText('Steak').parentElement).toHaveTextContent('Steaknot always in stock')
  })

  it('what the search found goes first in the items, and is named up top', () => {
    const found = { terms: ['cheese'], items: [{ tag: 'Cheddar Cheese', sometimes: false }], fields: [] }
    view({ item: tj, category: grocery, found })
    expect(screen.getByTestId('search-found')).toHaveTextContent('Cheddar Cheese')
    expect(within(screen.getByTestId('listing-items')).getAllByRole('listitem')[0]).toHaveTextContent('Cheddar Cheese')
  })

  it('a mikvah leads with a section per audience it serves', () => {
    const flag = (key: string, filterLabel: string): CategoryField => ({ key, label: key, filterLabel, type: 'boolean', renderAs: 'badge', filterable: true })
    const mikvah = makeCategory({
      id: 'mikvah',
      label: 'Mikvah',
      detailFields: [
        flag('womenTevillah', 'Women’s'),
        flag('menTevillah', 'Men’s'),
        { key: 'women_s_notes', label: 'Notes', type: 'textarea', renderAs: 'row', audienceKey: 'womenTevillah' },
        { key: 'men_s_notes', label: 'Notes', type: 'textarea', renderAs: 'row', audienceKey: 'menTevillah' },
      ],
    })
    view({ item: makeListing({ womenTevillah: true, menTevillah: true, women_s_notes: 'By appointment', men_s_notes: 'Right-hand door' }), category: mikvah })
    const card = screen.getByTestId('listing-groups')
    expect(within(card).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Women’s', 'Men’s'])
    expect(card).toHaveTextContent('By appointment')
    // Said once, in its section, not again in About.
    expect(screen.queryByTestId('listing-about')).not.toBeInTheDocument()
  })

  it('a WhatsApp group: what it’s for under the name, then Join, and no Directions', () => {
    const link: CategoryField = { key: 'link', label: 'Join group', type: 'url', renderAs: 'row', linkLabel: 'Join group', showInHeader: true }
    const groups = makeCategory({ id: 'whatsapp', label: 'WhatsApp Group', hasAddress: false, detailFields: [{ key: 'description', label: 'Description', type: 'textarea', renderAs: 'row' }, link] })
    view({ item: makeListing({ address: '', description: 'For people keeping kosher', link: 'https://chat.whatsapp.com/x' }), category: groups })
    const join = screen.getByRole('link', { name: /Join the group on WhatsApp/ })
    expect(join).toHaveAttribute('href', 'https://chat.whatsapp.com/x')
    expect(screen.getByText('For people keeping kosher').compareDocumentPosition(join) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText('Directions')).not.toBeInTheDocument()
    expect(screen.queryByTestId('listing-about')).not.toBeInTheDocument()
  })
})

describe('ListingView — about', () => {
  it('says the description is Google’s when the sync keeps it', () => {
    view({ item: { ...judah, placeId: 'p1', googleFields: ['description'] } })
    expect(screen.getByTestId('listing-about')).toHaveTextContent('Description from Google')
  })
  it('says nothing about where it came from when the sync doesn’t record keeping it', () => {
    // Every Google description fetched before the sync recorded ownership
    // reads like this; calling them the community's was wrong on all 66.
    view({ item: { ...judah, placeId: 'p1', googleFields: ['hours'] } })
    expect(screen.getByTestId('listing-about')).not.toHaveTextContent(/Description from/)
  })
  it('says nothing about where it came from on a listing never matched to Google', () => {
    view()
    expect(screen.getByTestId('listing-about')).not.toHaveTextContent(/Description from/)
  })
})

describe('ListingView — onward', () => {
  const near = (id: string, name: string, lat: number) => makeListing({ id, name, geo: { lat, lng: -75.0454 }, foodType: 'Restaurant' })
  const items = [judah, near('far', 'Far Place', 40.3), near('ritas', 'Rita’s', 40.09), near('hok', 'House of Kosher', 40.097), near('sk', 'Shtetl', 40.099)]

  it('the three nearest in the category, how far each is from here, then all of them', () => {
    const onOpen = vi.fn()
    const seeAll = vi.fn()
    view({ onward: { items, place: () => 'Bustleton', onOpen, seeAll: { label: 'See all 73 in Food', onClick: seeAll } } })
    const section = screen.getByTestId('listing-onward')
    expect(within(section).getByRole('heading')).toHaveTextContent('More food near here')
    const rows = within(section).getAllByRole('button').slice(0, 3)
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Rita’s · Bustleton'),
      expect.stringContaining('House of Kosher'),
      expect.stringContaining('Shtetl'),
    ])
    expect(rows[0]).toHaveTextContent('0.3 mi away')
    fireEvent.click(rows[1])
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'hok' }))
    fireEvent.click(within(section).getByRole('button', { name: 'See all 73 in Food' }))
    expect(seeAll).toHaveBeenCalled()
  })

  it('nothing onward where there’s no list to go on to', () => {
    view()
    expect(screen.queryByTestId('listing-onward')).not.toBeInTheDocument()
  })
})

describe('ListingView — how sure', () => {
  it('ends with the dated line, Google’s part first', () => {
    view({ item: { ...judah, placeId: 'p1', googleSyncedAt: '2026-09-30T06:59:09Z', googleFields: ['phone', 'website'], confirmedAt: '2026-08-20T16:30:00Z' } })
    expect(screen.getByTestId('listing-trust')).toHaveTextContent(/^Phone and website from Google, Sep 30\. Confirmed Aug 20\./)
  })

  it('a shul says its confirmation with its times, not again at the end', () => {
    const shuls = makeCategory({ id: 'synagogue', detailFields: [{ key: 'minyanim', label: 'Davening', type: 'minyanim', renderAs: 'row' }] })
    const shul = makeListing({ confirmedAt: '2026-09-29T05:56:24Z', minyanim: [{ id: 'm1', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }] })
    view({ item: shul, category: shuls })
    expect(screen.getByTestId('listing-davening')).toHaveTextContent('Times confirmed Sep 29.')
    expect(screen.getByTestId('listing-trust')).not.toHaveTextContent(/confirmed/i)
  })

  it('hours that aren’t the main thing say they’re Google’s too', () => {
    const m: CategoryField = { key: 'm', label: 'Kosher items', type: 'tags', renderAs: 'badge', showCountInHeader: true }
    const grocery = makeCategory({ detailFields: [hours, m] })
    view({
      item: makeListing({ m: ['Challah'], hours: { fri: { open: '09:00', close: '21:00' } }, placeId: 'p1', googleSyncedAt: '2026-09-30T06:59:09Z', googleFields: ['hours'] }),
      category: grocery,
    })
    expect(screen.getByTestId('listing-details')).toHaveTextContent('From Google, Sep 30')
  })
})

describe('ListingView — the one question', () => {
  it('asks what the listing doesn’t say yet, with a tap for each answer, before the dated line', () => {
    const category = makeCategory({ detailFields: [{ ...t, options: [{ value: 'Meat', label: 'Meat' }, { value: 'Dairy', label: 'Dairy' }, { value: 'Parve', label: 'Parve' }] }] })
    view({ item: makeListing({ id: 'sb', name: 'Sweet Box' }), category })
    const question = screen.getByTestId('listing-question')
    expect(question).toHaveTextContent('Meat, dairy or parve?')
    expect(within(question).getAllByRole('button').map((b) => b.textContent)).toEqual(['Meat', 'Dairy', 'Parve', 'Not sure'])
    expect(question.compareDocumentPosition(screen.getByTestId('listing-trust')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('asks nothing when there’s nothing to ask', () => {
    view()
    expect(screen.queryByTestId('listing-question')).not.toBeInTheDocument()
  })
})
