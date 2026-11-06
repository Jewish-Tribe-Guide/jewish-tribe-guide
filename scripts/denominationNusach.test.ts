import { describe, expect, it } from 'vitest'
import { DENOMINATIONS, isShulPage, planDetails, planFields } from './denomination-nusach.mjs'

// This script rewrites live Denomination answers in place, so what it does to
// each kind of stored value is pinned here, not left to the dry run alone.

const philly = [
  { key: 'photo', type: 'image', label: 'Photo' },
  {
    key: 'denomination',
    type: 'select',
    label: 'Denomination',
    options: ['Orthodox (Ashkenazi)', 'Orthodox (Sephardic)', 'Other'].map((v) => ({ value: v, label: v })),
    renderAs: 'badge',
    allowOther: true,
    filterable: true,
    multiSelect: false,
  },
  { key: 'minyanim', type: 'minyanim', label: 'Davening' },
]

describe('planFields', () => {
  it('gives a shul page the shared list, one choice, and Nusach right after it', () => {
    const next = planFields(philly, true)!
    expect(next.map((f) => f.key)).toEqual(['photo', 'denomination', 'nusach', 'minyanim'])
    expect(next[1]).toMatchObject({ options: DENOMINATIONS.map((v) => ({ value: v, label: v })), multiSelect: false, renderAs: 'badge', allowOther: true, filterable: true })
    expect(next[2]).toMatchObject({ type: 'select', filterable: true, renderAs: 'row' })
  })

  it('gives a school no Nusach, and its key d becomes denomination', () => {
    const next = planFields([{ key: 'd', type: 'select', label: 'Denomination', options: [], multiSelect: true }], false)!
    expect(next.map((f) => f.key)).toEqual(['denomination'])
    expect(next[0].multiSelect).toBe(false)
  })

  it('changes nothing twice', () => {
    expect(planFields(planFields(philly, true)!, true)).toBeNull()
    expect(planFields([{ key: 'denomination', type: 'text', label: 'Denomination' }], true)).toBeNull()
  })
})

describe('planDetails', () => {
  it('makes an Ashkenazi shul Orthodox with no Nusach, and a Sephardic one Orthodox and Sephardi', () => {
    expect(planDetails({ denomination: 'Orthodox (Ashkenazi)', website: 'x' }, true).next).toEqual({ denomination: 'Orthodox', website: 'x' })
    expect(planDetails({ denomination: 'Orthodox (Sephardic)' }, true).next).toEqual({ denomination: 'Orthodox', nusach: 'Sephardi (Edot HaMizrach)' })
  })

  it('gives a Sephardic school no Nusach, and keeps a Nusach already set', () => {
    expect(planDetails({ d: 'Orthodox (Sephardic)' }, false).next).toEqual({ denomination: 'Orthodox' })
    expect(planDetails({ denomination: 'Orthodox (Sephardic)', nusach: 'Ashkenaz' }, true).next).toEqual({ denomination: 'Orthodox', nusach: 'Ashkenaz' })
  })

  it('moves key d, and one value in a list becomes the value', () => {
    expect(planDetails({ d: 'Orthodox' }, false)).toMatchObject({ next: { denomination: 'Orthodox' }, change: 'key d → denomination' })
    expect(planDetails({ denomination: ['Orthodox'] }, true).next).toEqual({ denomination: 'Orthodox' })
  })

  it('leaves a value already on the list, and a place with none, alone', () => {
    expect(planDetails({ denomination: 'Reform' }, true).next).toBeNull()
    expect(planDetails({ website: 'x' }, true).next).toBeNull()
  })

  it('stops on what it would have to guess', () => {
    expect(planDetails({ denomination: ['Orthodox', 'Conservative'] }, true).problem).toMatch(/more than one/)
    expect(planDetails({ denomination: 'Traditional' }, true).problem).toMatch(/not on the list/)
  })
})

describe('isShulPage', () => {
  it('knows a shul page by its kind or its slug', () => {
    expect(isShulPage({ id: 'synagogues' })).toBe(true)
    expect(isShulPage({ id: 'houses', place_kind: 'shuls' })).toBe(true)
    expect(isShulPage({ id: 'school' })).toBe(false)
  })
})
