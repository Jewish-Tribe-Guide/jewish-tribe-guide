import { describe, expect, it } from 'vitest'
import { screenHeaderFromPath } from './screenHeaderFromPath'

const categories = [
  { id: 'restaurant', kind: 'listing' as const, pluralLabel: 'Food' },
  { id: 'eruv', kind: 'eruv' as const, pluralLabel: 'Eruv Information' },
  { id: 'zmanim', kind: 'zmanim' as const, pluralLabel: 'Candle Lighting & Zmanim' },
  { id: 'map', kind: 'map' as const, pluralLabel: 'Map' },
]
const strip = (sh: ReturnType<typeof screenHeaderFromPath>) => sh && { title: sh.title, back: !!sh.onBack, named: !!sh.named }

describe('screenHeaderFromPath', () => {
  it('names a category page, with a way back', () => {
    expect(strip(screenHeaderFromPath('/philly/restaurant', categories, null))).toEqual({ title: 'Food', back: true, named: false })
  })

  it('names a listing’s own page by its category, under the guide’s name', () => {
    expect(strip(screenHeaderFromPath('/philly/restaurant/abc', categories, null))).toEqual({ title: 'Food', back: true, named: true })
  })

  it('names the eruv and zmanim pages', () => {
    expect(screenHeaderFromPath('/philly/eruv', categories, null)?.title).toBe('Eruv Information')
    expect(screenHeaderFromPath('/philly/zmanim', categories, null)?.title).toBe('Candle Lighting & Zmanim')
  })

  it('names a tab’s page by its tab, with no way back', () => {
    expect(strip(screenHeaderFromPath('/philly/you', categories, null))).toEqual({ title: 'You', back: false, named: false })
    expect(screenHeaderFromPath('/philly/you', categories, [{ target: 'you', label: 'Saved' }])?.title).toBe('Saved')
    expect(screenHeaderFromPath('/philly/changes', categories, null)?.title).toBe('What changed')
  })

  it('gives Feedback a way back unless it is a tab', () => {
    expect(strip(screenHeaderFromPath('/philly/feedback', categories, null))).toEqual({ title: 'Feedback', back: true, named: false })
    expect(strip(screenHeaderFromPath('/philly/feedback', categories, [{ target: 'feedback', label: 'Tell us' }]))).toEqual({ title: 'Tell us', back: false, named: false })
  })

  it('leaves the home, the map and anything it does not know to the logo', () => {
    for (const path of ['/philly', '/philly/map', '/philly/admin', '/philly/nowhere', '/philly/changes/validated/2026-11-20', '/philly/eruv/center-city']) {
      expect(screenHeaderFromPath(path, categories, null)).toBeNull()
    }
  })
})
