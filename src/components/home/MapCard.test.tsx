// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
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

describe('MapCard (board G3)', () => {
  afterEach(cleanup)

  it('is one link to the map, with nothing else to press inside it', () => {
    render(<MapCard href="/philly/map" photo={null} categoryNames={['Food']} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/philly/map')
    expect(link).toHaveTextContent('Everything on one map')
    expect(link).toHaveTextContent('Open the map')
    expect(link.querySelectorAll('a, button')).toHaveLength(0)
  })

  it('shows the admin’s photo', () => {
    render(<MapCard href="/philly/map" photo={{ url: 'https://example.com/city-hall.jpg', alt: '' }} categoryNames={[]} />)
    const img = screen.getByTestId('home-map-card-picture').querySelector('img')
    expect(img?.getAttribute('src')).toContain('city-hall.jpg')
  })

  it('with no photo, the plain map glyph and never a drawn map', () => {
    render(<MapCard href="/philly/map" photo={null} categoryNames={[]} />)
    const picture = screen.getByTestId('home-map-card-picture')
    expect(picture.querySelector('img')).toBeNull()
    expect(picture.querySelectorAll('svg')).toHaveLength(1)
  })
})
