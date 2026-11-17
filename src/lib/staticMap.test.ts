import { describe, expect, it } from 'vitest'
import { possessive, staticMapUrl } from './staticMap'

describe('staticMapUrl', () => {
  it('centres on the place with its pin, at twice the pixels, without shop labels', () => {
    const url = new URL(staticMapUrl({ lat: 39.95, lng: -75.16 }, 'k', { width: 400, height: 120 }))
    expect(url.origin + url.pathname).toBe('https://maps.googleapis.com/maps/api/staticmap')
    expect(url.searchParams.get('center')).toBe('39.950000,-75.160000')
    expect(url.searchParams.get('markers')).toBe('color:0x1d4ed8|39.950000,-75.160000')
    expect(url.searchParams.get('size')).toBe('400x120')
    expect(url.searchParams.get('scale')).toBe('2')
    expect(url.searchParams.getAll('style')).toContain('feature:poi|element:labels|visibility:off')
  })

  it('keeps to Google’s 640 a side', () => {
    const url = new URL(staticMapUrl({ lat: 0, lng: 0 }, 'k', { width: 900, height: 700 }))
    expect(url.searchParams.get('size')).toBe('640x640')
  })
})

describe('possessive', () => {
  it('says Food’s and Synagogues’', () => {
    expect(possessive('Food')).toBe('Food’s')
    expect(possessive('Synagogues')).toBe('Synagogues’')
  })
})
