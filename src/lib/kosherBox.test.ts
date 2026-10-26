import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import { kosherBoxKeys, kosherKeysToUse, kosherRows, renamedTo } from './kosherBox'

// As dev's restaurants are set up (Oct 22).
const RESTAURANT = makeCategory({
  id: 'restaurant',
  label: 'Food',
  detailFields: [
    { key: 's', label: 'Short Description', type: 'text', renderAs: 'row' },
    { key: 't', label: 'Food Type', type: 'select', renderAs: 'badge', options: ['Meat', 'Dairy', 'Parve'].map((v) => ({ label: v, value: v })) },
    {
      key: 'kosherCert',
      label: 'Kosher Certification',
      type: 'select',
      renderAs: 'badge',
      caveat: { flagField: 'kosherPartial', noteField: 'kosherNote' },
      options: ['IKC', 'Keystone-K', 'Cherry-K'].map((v) => ({ label: v, value: v })),
    },
    { key: 'kosherPartial', label: 'Everything here is kosher', type: 'boolean', renderAs: 'hidden', invertDisplay: true },
    { key: 'kosherNote', label: 'What isn’t kosher?', type: 'textarea', renderAs: 'hidden' },
    { key: 'foodType', label: 'Store Type', type: 'select', renderAs: 'badge', options: ['Restaurant', 'Bakery', 'Catering', 'Ice Cream & Treats'].map((v) => ({ label: v, value: v })) },
    { key: 'k', label: 'Kosher Certification URL', type: 'url', renderAs: 'row' },
  ],
} as never)

const TWISTERS = { kosherCert: ['Keystone-K'], k: 'https://keystone-k.org/kosher/tasty-twisters-soft-pretzel-factory/', kosherPartial: true, kosherNote: 'Only Plain/Salt Pretzels are kosher' }

describe('the Kosher box', () => {
  it('is the listing editor’s facts row, headed by its hechsher', () => {
    expect(kosherBoxKeys(RESTAURANT)).toEqual(['t', 'kosherCert', 'k', 'kosherPartial', 'kosherNote'])
    // A grocery's "Kosher Store" isn't a hechsher: no box.
    expect(kosherBoxKeys(makeCategory({ detailFields: [{ key: 'isKosher', label: 'Kosher Store', type: 'select', renderAs: 'badge', options: [] }] } as never))).toEqual([])
  })

  it('its rows, as the drawing names them; a new value only highlighted', () => {
    const rows = kosherRows(RESTAURANT, TWISTERS, { ...TWISTERS, t: ['Parve'] })
    expect(rows.map((r) => [r.name, r.value, r.mark])).toEqual([
      ['Hechsher', 'Keystone-K', 'same'],
      ['Meat, dairy or parve', 'Parve', 'new'],
      ['Certificate', 'keystone-k.org/kosher/tasty-twisters-soft-pretzel-factory', 'same'],
      ['What isn’t kosher?', 'Only Plain/Salt Pretzels are kosher', 'same'],
    ])
    expect(kosherKeysToUse(rows)).toEqual(['t'])
  })

  it('a changed value says what it was; one going is the listing’s', () => {
    const rows = kosherRows(RESTAURANT, { kosherCert: ['IKC', 'Keystone-K'], t: ['Meat'] }, { kosherCert: ['IKC'], t: ['Dairy'] })
    expect(rows.map((r) => [r.name, r.value, r.was, r.mark])).toEqual([
      ['Hechsher', 'IKC', 'IKC, Keystone-K', 'changed'],
      ['Meat, dairy or parve', 'Dairy', 'Meat', 'changed'],
    ])
    const gone = kosherRows(RESTAURANT, TWISTERS, { ...TWISTERS, kosherCert: [], k: null })
    expect(gone.filter((r) => r.mark === 'gone').map((r) => r.value)).toEqual(['Keystone-K', 'keystone-k.org/kosher/tasty-twisters-soft-pretzel-factory'])
  })

  it('the same hechsherim in another order are the same', () => {
    expect(kosherRows(RESTAURANT, { kosherCert: ['IKC', 'Keystone-K'] }, { kosherCert: ['Keystone-K', 'IKC'] })[0]).toMatchObject({ name: 'Hechsher', mark: 'same' })
  })

  it('what isn’t kosher is compared for being there, never by wording, and goes with its yes/no', () => {
    const reworded = kosherRows(RESTAURANT, TWISTERS, { ...TWISTERS, kosherNote: 'Only plain/salt pretzels are kosher' })
    expect(reworded.find((r) => r.name === 'What isn’t kosher?')).toMatchObject({ mark: 'same', value: 'Only Plain/Salt Pretzels are kosher' })
    expect(kosherKeysToUse(reworded)).toEqual([])
    const added = kosherRows(RESTAURANT, { kosherCert: ['Keystone-K'] }, TWISTERS)
    expect(added.find((r) => r.name === 'What isn’t kosher?')).toMatchObject({ mark: 'new' })
    expect(kosherKeysToUse(added)).toEqual(['k', 'kosherNote', 'kosherPartial'])
  })

  it('a row neither says anything for is left out', () => {
    expect(kosherRows(RESTAURANT, { kosherCert: ['IKC'] }).map((r) => r.name)).toEqual(['Hechsher'])
  })
})

describe('what a list’s note says', () => {
  it('the place by a near name, when there is one', () => {
    const note = `Not on Keystone-K's list of the places it certifies today: https://keystone-k.org/establishments/\nKeystone-K was its only certification, so approving removes the listing.\nThe list does have "Kosher City Eats and Catering by Brazilian Kosher" (https://keystone-k.org/kosher/kosher-city-eats/). The same business under a new name?`
    expect(renamedTo([note])).toEqual({ name: 'Kosher City Eats and Catering by Brazilian Kosher', url: 'https://keystone-k.org/kosher/kosher-city-eats/' })
    expect(renamedTo(['Not on Keystone-K’s list.'])).toBeNull()
  })

})
