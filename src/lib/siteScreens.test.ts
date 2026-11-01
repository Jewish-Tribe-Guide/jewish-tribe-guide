import { describe, expect, it } from 'vitest'
import type { CategoryConfig } from './categories'
import { SITE_SCREENS, siteScreenState } from './siteScreens'

const row = (kind: CategoryConfig['kind'], active?: boolean) => ({ id: kind, kind, pluralLabel: kind, active }) as CategoryConfig

describe('siteScreenState', () => {
  it('offers the Map, Candle Lighting and Eruv, and not Jewish Medical Resources', () => {
    expect(SITE_SCREENS.map((s) => s.kind)).toEqual(['map', 'zmanim', 'eruv'])
  })

  it('reads no row and a hidden row as off, and a shown row as on', () => {
    const state = siteScreenState([row('map', true), row('eruv', false), row('medical', true), row('listing', true)])
    expect(state.map((s) => [s.screen.kind, s.on, s.row?.id])).toEqual([
      ['map', true, 'map'],
      ['zmanim', false, undefined],
      ['eruv', false, 'eruv'],
    ])
  })
})
