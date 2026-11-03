import { describe, expect, it } from 'vitest'
import type { CategoryConfig } from './categories'
import { ERUV_SCREEN, SITE_SCREENS, screenState, siteScreenState } from './siteScreens'

const row = (kind: CategoryConfig['kind'], active?: boolean) => ({ id: kind, kind, pluralLabel: kind, active }) as CategoryConfig

describe('siteScreenState', () => {
  it('switches the Map and Candle Lighting, and not the Eruv or Jewish Medical Resources', () => {
    expect(SITE_SCREENS.map((s) => s.kind)).toEqual(['map', 'zmanim'])
  })

  it('reads no row and a hidden row as off, and a shown row as on', () => {
    const state = siteScreenState([row('map', true), row('zmanim', false), row('medical', true), row('listing', true)])
    expect(state.map((s) => [s.screen.kind, s.on, s.row?.id])).toEqual([
      ['map', true, 'map'],
      ['zmanim', false, 'zmanim'],
    ])
  })

  it('reads the Eruv the same way, for its row in the category list', () => {
    expect(screenState([], ERUV_SCREEN)).toMatchObject({ on: false, row: undefined })
    expect(screenState([row('eruv', false)], ERUV_SCREEN)).toMatchObject({ on: false, row: { id: 'eruv' } })
    expect(screenState([row('eruv')], ERUV_SCREEN)).toMatchObject({ on: true, row: { id: 'eruv' } })
  })
})
