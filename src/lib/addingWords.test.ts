import { describe, expect, it } from 'vitest'
import { addingWords } from './addingWords'

describe('addingWords', () => {
  it('names a countable category', () => {
    expect(addingWords({ label: 'Synagogue', pluralLabel: 'Synagogues' })).toEqual({ title: 'Add a synagogue', find: 'Find the synagogue' })
    expect(addingWords({ label: 'Hotel', pluralLabel: 'Hotels' }).title).toBe('Add a hotel')
  })

  it('says "an" before a vowel', () => {
    expect(addingWords({ label: 'Eruv', pluralLabel: 'Eruvs' }).title).toBe('Add an eruv')
  })

  it('keeps a name’s own capitals', () => {
    expect(addingWords({ label: 'WhatsApp Group', pluralLabel: 'WhatsApp Groups' })).toEqual({ title: 'Add a WhatsApp group', find: 'Find the WhatsApp group' })
  })

  it('a name with no plural of its own is "Add to" it, and the place', () => {
    expect(addingWords({ label: 'Food', pluralLabel: 'Food' })).toEqual({ title: 'Add to Food', find: 'Find the place' })
    expect(addingWords({ label: 'Childcare' })).toEqual({ title: 'Add to Childcare', find: 'Find the place' })
  })
})
