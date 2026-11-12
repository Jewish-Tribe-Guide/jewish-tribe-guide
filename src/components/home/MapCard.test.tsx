// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import MapCard, { mapCardLine } from './MapCard'

describe('mapCardLine', () => {
  it('names the biggest categories, five at most', () => {
    expect(mapCardLine(['Food', 'Grocery', 'Synagogues', 'Hotels', 'Hospitals', 'Mikvah'])).toBe('Food, Grocery, Synagogues, Hotels and Hospitals, together.')
    expect(mapCardLine(['Food', 'Grocery'])).toBe('Food and Grocery, together.')
    expect(mapCardLine(['Food'])).toBe('Food, all together.')
    expect(mapCardLine([])).toBe('Every place in the guide, together.')
  })
})

/** A screen that measures as a phone (true) or a computer (false). */
function screenIsPhone(phone: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: phone, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
}

describe('MapCard (board G3)', () => {
  beforeEach(() => screenIsPhone(false))
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('never puts the picture on a phone, where the card isn’t shown', () => {
    screenIsPhone(true)
    render(<MapCard href="/philly/map" photo={{ url: 'https://example.com/osm.jpg', alt: '', credit: '© OpenStreetMap contributors' }} categoryNames={[]} />)
    expect(screen.getByTestId('home-map-card-picture').querySelector('img')).toBeNull()
    expect(screen.queryByTestId('home-map-card-credit')).toBeNull()
  })

  it('is one link to the map, with nothing else to press inside it', () => {
    render(<MapCard href="/philly/map" photo={null} categoryNames={['Food']} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/philly/map')
    expect(link).toHaveTextContent('Everything on one map')
    expect(link).toHaveTextContent('Open the map')
    expect(link.querySelectorAll('a, button')).toHaveLength(0)
  })

  // No chevron on "Open the map" (the user, Nov 11): the button is its words.
  it('“Open the map” is its words alone, no chevron', () => {
    render(<MapCard href="/philly/map" photo={null} categoryNames={['Food']} />)
    const button = screen.getByText('Open the map').closest('span')!
    expect(button).toHaveTextContent(/^Open the map$/)
    expect(button.querySelector('svg')).toBeNull()
  })

  it('shows the admin’s photo', () => {
    render(<MapCard href="/philly/map" photo={{ url: 'https://example.com/city-hall.jpg', alt: '' }} categoryNames={[]} />)
    const img = screen.getByTestId('home-map-card-picture').querySelector('img')
    expect(img?.getAttribute('src')).toContain('city-hall.jpg')
  })

  it('shows the credit a picture’s licence asks for, and none for a photo without one', () => {
    render(<MapCard href="/philly/map" photo={{ url: 'https://example.com/osm.jpg', alt: '', credit: '© OpenStreetMap contributors' }} categoryNames={[]} />)
    expect(screen.getByTestId('home-map-card-credit')).toHaveTextContent('© OpenStreetMap contributors')
    cleanup()
    render(<MapCard href="/philly/map" photo={{ url: 'https://example.com/city-hall.jpg', alt: '' }} categoryNames={[]} />)
    expect(screen.queryByTestId('home-map-card-credit')).toBeNull()
  })

  it('with no photo, the plain map glyph and never a drawn map', () => {
    render(<MapCard href="/philly/map" photo={null} categoryNames={[]} />)
    const picture = screen.getByTestId('home-map-card-picture')
    expect(picture.querySelector('img')).toBeNull()
    expect(picture.querySelectorAll('svg')).toHaveLength(1)
  })
})
