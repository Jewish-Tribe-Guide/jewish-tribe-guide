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
