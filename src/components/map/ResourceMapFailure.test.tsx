// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// No key, or Google refusing it: what a visitor sees in the map's place.
// It said "Check that the Google Maps API key is configured", a note for
// whoever runs the site (Nov 18, item 17 of the public review). It says
// what the map-crash fallback says now (MapBoundary).
vi.mock('@/lib/loadGoogleMaps', () => ({
  MAPS_API_KEY: '',
  MAPS_MAP_ID: '',
  loadGoogleMaps: vi.fn(() => new Promise(() => {})),
  mapsAuthFailed: () => false,
  onMapsAuthFailure: () => () => {},
}))

import ResourceMap from './ResourceMap'

describe('ResourceMap when the map can’t load', () => {
  it('tells the visitor the list has everything, and nothing about keys', () => {
    render(<ResourceMap points={[]} userLocation={null} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('The map couldn’t load. Everything on it is in the list.')
    expect(status).not.toHaveTextContent(/API|key/)
  })
})
