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
