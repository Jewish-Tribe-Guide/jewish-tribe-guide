// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import PlaceDetailBody from './PlaceDetailBody'
import { makeCategory, makeListing } from '@/test/providerFixtures'

// The "via Google" badge marks a field the daily sync is actually still
// refreshing (see src/lib/googlePlaces.ts's ownership rule) — it must track
// real `googleFields` ownership, not a guess. This used to be gated on
// "does this listing have any hours at all", a proxy that was wrong for the
// common case (a listing with both hours and phone synced never showed the
// phone badge, since hours weren't empty).

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

afterEach(() => cleanup())

describe('PlaceDetailBody — via Google badge', () => {
  it('shows the badge on phone when phone is Google-owned', () => {
    const category = makeCategory({ hasPhone: true })
    const item = makeListing({ phone: '(555) 123-4567', placeId: 'place-1', googleFields: ['phone'] })
    render(<PlaceDetailBody item={item} category={category} />)

    expect(screen.getByText('via Google')).toBeInTheDocument()
  })

  it('does not show the badge on phone when phone was typed by hand', () => {
    const category = makeCategory({ hasPhone: true })
    const item = makeListing({ phone: '(555) 123-4567', placeId: 'place-1', googleFields: ['hours'] })
    render(<PlaceDetailBody item={item} category={category} />)

    expect(screen.queryByText('via Google')).not.toBeInTheDocument()
  })

  it('shows the badge on hours when hours is Google-owned', () => {
    const category = makeCategory({
      detailFields: [{ key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row' }],
    })
    const item = makeListing({
      hours: { sun: null, mon: { open: '09:00', close: '17:00' }, tue: null, wed: null, thu: null, fri: null, sat: null },
      placeId: 'place-1',
      googleFields: ['hours'],
    })
    render(<PlaceDetailBody item={item} category={category} />)

    expect(screen.getByText('via Google')).toBeInTheDocument()
  })

  it('does not show the badge on a mikvah audience-hours field even when the listing is Google-synced', () => {
    // Only the generic 'hours' key is ever written by the sync — a mikvah's
    // women_s_hours is always manual, so it must never claim to be synced.
    const category = makeCategory({
      detailFields: [{ key: 'women_s_hours', label: "Women's Hours", type: 'hours', renderAs: 'row' }],
    })
    const item = makeListing({
      women_s_hours: { sun: null, mon: { open: '09:00', close: '17:00' }, tue: null, wed: null, thu: null, fri: null, sat: null },
      placeId: 'place-1',
      googleFields: ['hours'],
    })
    render(<PlaceDetailBody item={item} category={category} />)

    expect(screen.queryByText('via Google')).not.toBeInTheDocument()
  })

  it('does not show a badge on the listing name, even when name is in googleFields', () => {
    const category = makeCategory({ hasPhone: true })
    const item = makeListing({
      name: 'Acme Grocery',
      phone: '(555) 123-4567',
      placeId: 'place-1',
      googleFields: ['name', 'phone'],
    })
    render(<PlaceDetailBody item={item} category={category} />)

    // Exactly one badge total — the phone's, not a second one on the name.
    expect(screen.getAllByText('via Google')).toHaveLength(1)
  })

  it('does not show the badge when the listing has no placeId at all', () => {
    const category = makeCategory({ hasPhone: true })
    const item = makeListing({ phone: '(555) 123-4567', googleFields: ['phone'] })
    render(<PlaceDetailBody item={item} category={category} />)

    expect(screen.queryByText('via Google')).not.toBeInTheDocument()
  })
})

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
