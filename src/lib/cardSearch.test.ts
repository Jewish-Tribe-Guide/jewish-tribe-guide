import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import { cardMatches, categoryCards } from './cardSearch'

const synagogue = makeCategory({ id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues' })
const hospitals = makeCategory({ id: 'hosp', label: 'Hospital', pluralLabel: 'Hospitals', kind: 'medical' })
const zmanim = makeCategory({ id: 'z', label: 'Zmanim', pluralLabel: 'Zmanim', kind: 'zmanim' })
const eruv = makeCategory({ id: 'e', label: 'Eruv Information', pluralLabel: 'Eruv Information', kind: 'eruv' })
const map = makeCategory({ id: 'map', label: 'Map', pluralLabel: 'Map', kind: 'map' })

describe('categoryCards', () => {
  it('has a card for each listing category and each page, opening the right screen', () => {
    expect(categoryCards([synagogue, hospitals, zmanim, eruv, map]).map(({ id, view, title }) => ({ id, view, title }))).toEqual([
      { id: 'medical', view: 'hospitals', title: 'Hospitals' },
      { id: 'synagogue', view: 'synagogue', title: 'Synagogues' },
      { id: 'zmanim', view: 'zmanim', title: 'Zmanim' },
      { id: 'eruv', view: 'eruv', title: 'Eruv Information' },
    ])
  })

  it('answers the words people use that no title says', () => {
    const cards = categoryCards([synagogue, zmanim, eruv])
    const answering = (q: string) => cards.filter((c) => cardMatches(c, q)).map((c) => c.id)
    expect(answering('havdalah')).toEqual(['zmanim'])
    expect(answering('candle lighting')).toEqual(['zmanim'])
    expect(answering('is the eruv up')).toEqual(['eruv'])
  })
})
