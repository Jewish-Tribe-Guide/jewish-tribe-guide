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
})
