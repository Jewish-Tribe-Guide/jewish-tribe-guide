// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CategoryTile } from './CategoryTiles'
import type { CardDef } from './sections'

// Board R3 (the user, Nov 14): a phone tile is the category's picture with
// its name under it in dark text, not white words over a darkened photo.
// Right now's rows are photos with words on them (Q1), and the tiles the
// same made the home one run of pictures.

afterEach(cleanup)

const card = { id: 'restaurant', title: 'Food', href: '/philly/restaurant' } as CardDef

describe('a phone home tile (board R3)', () => {
  it('the name under the picture, in dark text, nothing laid over the photo', () => {
    render(<CategoryTile card={card} photo="https://example.com/food.jpg" color="#0f766e" />)
    const link = screen.getByRole('link', { name: 'Food' })
    expect(link).toHaveAttribute('href', '/philly/restaurant')
    const picture = screen.getByTestId('tile-picture')
    const name = screen.getByTestId('tile-name')
    // The name is not inside the picture, and comes after it.
    expect(picture.contains(name)).toBe(false)
    expect(picture.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(name).toHaveClass('text-ink')
    expect(name.className).not.toMatch(/text-white|text-shadow/)
    // Only the photo in the picture: no darkening laid over it.
    expect(picture.querySelector('img')).not.toBeNull()
    expect(picture.querySelector('[class*="bg-slate-900"]')).toBeNull()
  })

  it('no picture: its tint stands in, the name still under it', () => {
    render(<CategoryTile card={card} photo={null} color="#0f766e" />)
    const picture = screen.getByTestId('tile-picture')
    expect(picture.querySelector('img')).toBeNull()
    expect(picture.style.backgroundColor).not.toBe('')
    expect(picture.contains(screen.getByTestId('tile-name'))).toBe(false)
  })
})
