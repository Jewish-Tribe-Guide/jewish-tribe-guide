// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import PlaceDetailBody from './PlaceDetailBody'
import { makeCategory, makeListing } from '@/test/providerFixtures'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

afterEach(() => cleanup())

describe('PlaceDetailBody — "Synced from Google" note', () => {
  it('shows the note when the listing still has a placeId', () => {
    const category = makeCategory()
    const item = makeListing({ placeId: 'place-1', googleSyncedAt: new Date().toISOString() })
    render(<PlaceDetailBody item={item} category={category} />)

    expect(screen.getByText(/Synced from Google/)).toBeInTheDocument()
  })

  it('hides the note when placeId was cleared, even if a stale googleSyncedAt is still on the record', () => {
    // A bad Google match gets corrected by clearing placeId, but a leftover
    // googleSyncedAt from before that fix shouldn't keep claiming the
    // listing is synced — it no longer is (it's not in the sync's daily
    // query at all without a placeId). See the real incident this covers:
    // Mikvah Moishe Zvi and The Brazilian BBQ both showed this after a bad
    // placeId match was cleared but the timestamp wasn't cleaned up with it.
    const category = makeCategory()
    const item = makeListing({ googleSyncedAt: new Date().toISOString() })
    render(<PlaceDetailBody item={item} category={category} />)

    expect(screen.queryByText(/Synced from Google/)).not.toBeInTheDocument()
  })
})

// `description` (googleDescription) is now a tracked, ownable field like
// name/hours/phone/website — see OWNABLE_SYNC_FIELDS' own doc — which is
// what lets this note say which one a listing actually has, rather than
// guessing from whether it merely has a placeId.
describe('PlaceDetailBody — description provenance note', () => {
  const category = makeCategory({
    detailFields: [{ key: 'googleDescription', label: 'Description', type: 'text' }],
  })

  it('says "From Google" when the sync owns the description field', () => {
    const item = makeListing({
      placeId: 'place-1',
      googleDescription: "Google's editorial summary.",
      googleFields: ['description'],
    })
    render(<PlaceDetailBody item={item} category={category} />)

    expect(screen.getByText('From Google')).toBeInTheDocument()
  })

  it('says "Community-submitted" when a person wrote it and the sync does not own it', () => {
    const item = makeListing({
      placeId: 'place-1',
      googleDescription: 'Written by the community.',
      googleFields: ['name', 'hours'], // description deliberately absent
    })
    render(<PlaceDetailBody item={item} category={category} />)

    expect(screen.getByText('Community-submitted')).toBeInTheDocument()
  })

  it('shows no provenance note at all for a listing that was never Google-synced', () => {
    // No placeId — every description here is trivially community-submitted,
    // so a note saying so on every single non-synced listing would be noise.
    const item = makeListing({ googleDescription: 'Written by the community.' })
    render(<PlaceDetailBody item={item} category={category} />)

    expect(screen.getByText('Written by the community.')).toBeInTheDocument()
    expect(screen.queryByText('From Google')).not.toBeInTheDocument()
    expect(screen.queryByText('Community-submitted')).not.toBeInTheDocument()
  })

  it('shows no provenance note when the description is empty, even with a placeId', () => {
    const item = makeListing({ placeId: 'place-1', googleFields: ['description'] })
    render(<PlaceDetailBody item={item} category={category} />)

    expect(screen.queryByText('From Google')).not.toBeInTheDocument()
    expect(screen.queryByText('Community-submitted')).not.toBeInTheDocument()
  })
})

// A showInHeader url field (e.g. a category's Website link) assumes its
// caller has a persistent collapsed row showing it elsewhere — true for
// GenericListingCard's own mobile accordion, false for anything that
// doesn't have one (ListingDetailModal, MapPlaceDetail), which left the
// field simply missing once opened. This is what caught it.
describe('PlaceDetailBody — includeHeaderUrlFields', () => {
  it('omits a showInHeader url field by default (the caller already shows it)', () => {
    const category = makeCategory({
      detailFields: [{ key: 'w', label: 'Website', type: 'url', showInHeader: true }],
    })
    const item = makeListing({ w: 'https://example.com' })
    render(<PlaceDetailBody item={item} category={category} />)

    expect(screen.queryByText('Website')).not.toBeInTheDocument()
  })

  it('includes it when the caller says it has no such header of its own', () => {
    const category = makeCategory({
      detailFields: [{ key: 'w', label: 'Website', type: 'url', showInHeader: true }],
    })
    const item = makeListing({ w: 'https://example.com' })
    render(<PlaceDetailBody item={item} category={category} includeHeaderUrlFields />)

    expect(screen.getByText('Website')).toBeInTheDocument()
  })
})

// A section's guard is usually `condition && (<div>...)`, which correctly
// short-circuits to the boolean `false` when empty — except addressSection's
// condition is an OR-chain ending in `syncedNote`, and `a || b || c` returns
// the LAST operand when every one is falsy, not necessarily `false` itself.
// With nothing to show, that chain evaluated to `null` (syncedNote's own
// empty value) — which passed a `s !== false` filter that only ever meant
// to exclude `false` — so an entirely empty addressSection still counted as
// a real section for divider placement, and the section after it got a
// stray `<hr>` above it with nothing rendered between the two. Caught live:
// Networking's "The Chevra" (no address/phone/hours) showed exactly this.
describe('PlaceDetailBody — no stray divider from an entirely empty section', () => {
  it('renders no <hr> when the only real content is a single row field', () => {
    const category = makeCategory({
      hasAddress: false,
      hasPhone: false,
      detailFields: [{ key: 'd', label: 'Description', type: 'textarea', renderAs: 'row' }],
    })
    const item = makeListing({ address: '', d: 'A description with no address, phone, or hours nearby.' })
    const { container } = render(<PlaceDetailBody item={item} category={category} />)

    expect(container.querySelectorAll('hr')).toHaveLength(0)
    expect(screen.getByText(/A description with no address/)).toBeInTheDocument()
  })
})

describe('PlaceDetailBody — "N {countLabel}" count chip', () => {
  // Same split-text-node situation as GenericListingCard's own count-badge
  // tests — see that file's own comment on why a function matcher is needed.
  function chipText(text: string) {
    return (_: string, element: Element | null) => element?.tagName === 'SPAN' && element.textContent === text
  }

  // The map's place-detail popup (MapPlaceDetail) has no collapsed header of
  // its own — it renders PlaceDetailBody as the ENTIRE view — so unlike
  // GenericListingCard, which shows this count in its own header and passes
  // hideCountBadge to suppress a duplicate here, the map had nowhere this
  // count ever showed at all.
  it('shows the count chip by default', () => {
    const category = makeCategory({
      detailFields: [
        { key: 'items', label: 'Kosher items available', type: 'tags', showCountInHeader: true, countLabel: 'kosher item' },
      ],
    })
    const item = makeListing({ items: ['Milk', 'Bread', 'Cheese'] })
    render(<PlaceDetailBody item={item} category={category} />)

    expect(screen.getByText(chipText('3 kosher items'))).toBeInTheDocument()
  })

  it('hides the count chip when the caller already shows it elsewhere', () => {
    const category = makeCategory({
      detailFields: [
        { key: 'items', label: 'Kosher items available', type: 'tags', showCountInHeader: true, countLabel: 'kosher item' },
      ],
    })
    const item = makeListing({ items: ['Milk', 'Bread', 'Cheese'] })
    render(<PlaceDetailBody item={item} category={category} hideCountBadge />)

    expect(screen.queryByText(/kosher item/)).not.toBeInTheDocument()
  })

  // A count already says "yes, kosher" — the badge countReplacesKey points at
  // would just repeat that in a less useful form. GenericListingCard already
  // covered this for its own collapsed header; this is the same rule inside
  // PlaceDetailBody itself, so a caller that doesn't set hiddenBadgeKeys
  // (the map's place-detail popup) doesn't show both the count AND the raw
  // badge it replaces.
  it('suppresses the badge the count replaces, even when the caller sets no hiddenBadgeKeys', () => {
    const category = makeCategory({
      detailFields: [
        { key: 'isKosher', label: 'Kosher', type: 'boolean', renderAs: 'badge', filterable: true },
        {
          key: 'items',
          label: 'Kosher items available',
          type: 'tags',
          showCountInHeader: true,
          countLabel: 'kosher item',
          countReplacesKey: 'isKosher',
        },
      ],
    })
    const item = makeListing({ isKosher: true, items: ['Milk', 'Bread'] })
    render(<PlaceDetailBody item={item} category={category} />)

    expect(screen.getByText(chipText('2 kosher items'))).toBeInTheDocument()
    expect(screen.queryByText('Kosher')).not.toBeInTheDocument()
  })

  // The count chip landed ahead of "Open" when it was first added here — Open
  // is the most time-sensitive, highest-priority fact about a listing, and
  // GenericListingCard's own collapsed header has always led with it, so the
  // two callers disagreeing about which comes first read as a regression
  // (spotted comparing this branch against prod, not caught by either of the
  // count-chip tests above since neither one also renders an Open badge).
  it('always renders "Open" before the count chip when both apply', () => {
    vi.useFakeTimers()
    try {
      // A Friday, mid-afternoon, for a place open 09:00-17:00 that day.
      vi.setSystemTime(new Date('2026-08-28T14:00:00'))
      const category = makeCategory({
        detailFields: [
          { key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row' },
          { key: 'items', label: 'Kosher items available', type: 'tags', showCountInHeader: true, countLabel: 'kosher item' },
        ],
      })
      const item = makeListing({
        hours: { fri: { open: '09:00', close: '17:00' } },
        items: ['Milk', 'Bread', 'Cheese'],
      })
      render(<PlaceDetailBody item={item} category={category} />)

      const openChip = screen.getByText('Open')
      const countChip = screen.getByText(chipText('3 kosher items'))
      expect(openChip.compareDocumentPosition(countChip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })
})

// A row field's label used to render inline, sharing one text node with its
// value ("Description: Grocery chain..."), so a tags field's own new caption
// (see below) couldn't reuse the same styling without either shrinking to
// match the tags caption or the tags caption growing to match — they were
// two different visual treatments for the same "what is this field" job.
// The label now sits on its own line, the same "label above content" shape
// daveningSection and the tags caption already use, and at the exact same
// size/color as the tags caption.
describe('PlaceDetailBody — row field label', () => {
  it('renders a row field\'s label on its own line, separate from the value', () => {
    const category = makeCategory({
      detailFields: [{ key: 'd', label: 'Description', type: 'textarea', renderAs: 'row' }],
    })
    const item = makeListing({ d: 'A place with great bagels.' })
    render(<PlaceDetailBody item={item} category={category} />)

    // Not one merged "Description: A place with great bagels." text node —
    // the label and the value are each their own element.
    expect(screen.queryByText(/Description:/)).not.toBeInTheDocument()
    const label = screen.getByText('Description')
    const value = screen.getByText('A place with great bagels.')
    expect(label).not.toBe(value)
  })

  it('omits the label entirely for a field marked hideLabel', () => {
    const category = makeCategory({
      detailFields: [{ key: 'd', label: 'Description', type: 'textarea', renderAs: 'row', hideLabel: true }],
    })
    const item = makeListing({ d: 'A place with great bagels.' })
    render(<PlaceDetailBody item={item} category={category} />)

    expect(screen.queryByText('Description')).not.toBeInTheDocument()
    expect(screen.getByText('A place with great bagels.')).toBeInTheDocument()
  })
})

// A tags field's chips used to render as a bare row with no caption at all —
// fine for the collapsed card's "N kosher items" count chip (it names the
// items right there), but once expanded there was nothing telling a visitor
// what the chips underneath meant. Captioned with the field's own admin-set
// `label`, the same pattern daveningSection already uses for its own caption.
describe('PlaceDetailBody — tags field caption', () => {
  it('labels a tags field\'s chips with the field\'s own label', () => {
    const category = makeCategory({
      detailFields: [{ key: 'items', label: 'Kosher Items', type: 'tags' }],
    })
    const item = makeListing({ items: ['Milk', 'Bread'] })
    render(<PlaceDetailBody item={item} category={category} />)

    expect(screen.getByText('Kosher Items')).toBeInTheDocument()
    expect(screen.getByText('Milk')).toBeInTheDocument()
  })

  // A category can have more than one tags field (e.g. a restaurant's
  // "Kosher Items" and "Dietary Options"). They used to be flattened into
  // one merged, unlabeled chip row — indistinguishable from each other, not
  // just unlabeled. Each field now gets its own captioned block.
  it('keeps two tags fields as separate, independently-labeled blocks rather than merging them', () => {
    const category = makeCategory({
      detailFields: [
        { key: 'items', label: 'Kosher Items', type: 'tags' },
        { key: 'diet', label: 'Dietary Options', type: 'tags' },
      ],
    })
    const item = makeListing({ items: ['Milk'], diet: ['Vegan'] })
    render(<PlaceDetailBody item={item} category={category} />)

    expect(screen.getByText('Kosher Items')).toBeInTheDocument()
    expect(screen.getByText('Milk')).toBeInTheDocument()
    expect(screen.getByText('Dietary Options')).toBeInTheDocument()
    expect(screen.getByText('Vegan')).toBeInTheDocument()
  })

  it('skips a tags field entirely when this listing has no values for it', () => {
    const category = makeCategory({
      detailFields: [{ key: 'items', label: 'Kosher Items', type: 'tags' }],
    })
    const item = makeListing({ items: [] })
    render(<PlaceDetailBody item={item} category={category} />)

    expect(screen.queryByText('Kosher Items')).not.toBeInTheDocument()
  })
})

// Opening a listing from a search used to leave what was searched for to be
// found again among everything the store stocks.
describe('PlaceDetailBody — what the search found', () => {
  const category = makeCategory({ detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }] })
  const item = makeListing({ m: ['Challah', 'Wine', 'Cheddar Cheese', 'Hummus'], m_sometimes: ['Goat Cheese'] })
  const found = {
    terms: ['cheese'],
    items: [
      { tag: 'Cheddar Cheese', sometimes: false },
      { tag: 'Goat Cheese', sometimes: true },
    ],
    fields: [],
  }

  it('names what matched at the top, with the words asked for in bold', () => {
    render(<PlaceDetailBody item={item} category={category} found={found} />)
    const box = screen.getByTestId('search-found')
    expect(box).toHaveTextContent('Matches your search')
    expect(box).toHaveTextContent('Cheddar Cheese')
    expect(box).toHaveTextContent('Goat Cheese · not always in stock')
    expect([...box.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['Cheese', 'Cheese'])
  })

  it('puts the matched items first in the item list, marked', () => {
    render(<PlaceDetailBody item={item} category={category} found={found} />)
    const list = screen.getByText('Kosher items').parentElement!
    const chips = [...list.querySelectorAll('span, button')].filter((el) => el.children.length === 0 && el.textContent)
    expect(chips.map((c) => c.textContent)[0]).toBe('Cheddar Cheese')
    expect(chips[0].className).toContain('brand-teal')
    expect(chips.find((c) => c.textContent === 'Challah')!.className).not.toContain('brand-teal')
  })

  it('shows the field it matched on when no item did', () => {
    const cert = { terms: ['keystone'], items: [], fields: [{ label: 'Hechsher', text: 'Keystone-K', describes: false }] }
    render(<PlaceDetailBody item={item} category={category} found={cert} />)
    expect(screen.getByTestId('search-found')).toHaveTextContent('Hechsher: Keystone-K')
    expect(screen.getByTestId('search-found').querySelector('mark')?.textContent).toBe('Keystone')
  })

  it('shows nothing extra without a search', () => {
    render(<PlaceDetailBody item={item} category={category} />)
    expect(screen.queryByTestId('search-found')).not.toBeInTheDocument()
  })
})
