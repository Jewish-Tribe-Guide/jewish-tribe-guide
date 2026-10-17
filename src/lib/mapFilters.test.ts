import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { CategoryField } from './categories'
import {
  activeFilters,
  filterCount,
  openNowAll,
  passesFields,
  readMapFilters,
  setOpenNowFor,
  toggleBool,
  toggleOpenNow,
  toggleSelect,
  writeMapFilters,
} from './mapFilters'

// The categories as the live site has them (read Sep 30), trimmed.
const hours: CategoryField = { key: 'hours', label: 'Hours', type: 'hours', filterable: true }
const food = makeCategory({
  id: 'restaurant',
  pluralLabel: 'Food',
  detailFields: [
    hours,
    { key: 't', label: 'Food Type', type: 'select', filterable: true },
    { key: 'kosherCert', label: 'Kosher Certification', filterLabel: 'Kosher Cert', type: 'select', filterable: true },
  ],
})
const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery', detailFields: [hours, { key: 'isKosher', label: 'Kosher', type: 'select', filterable: true }] })
const shuls = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues', detailFields: [{ key: 'denomination', label: 'Denomination', type: 'select', filterable: true }] })
const cemetery = makeCategory({ id: 'cemetery', pluralLabel: 'Cemeteries', detailFields: [{ key: 't', label: 'Type', type: 'select', filterable: true }] })
const mikvah = makeCategory({ id: 'mikvah', pluralLabel: 'Mikvah', detailFields: [hours, { key: 'keilim', label: 'Keilim', type: 'boolean', filterable: true }] })
const all = [food, grocery, shuls, cemetery, mikvah]

describe('mapFilters — one category’s filters are its own', () => {
  it('Food’s Meat doesn’t touch cemeteries, though both call the field "t"', () => {
    const f = toggleSelect({}, 'restaurant', 't', 'Meat')
    expect(passesFields({ t: 'Meat' }, f.restaurant)).toBe(true)
    expect(passesFields({ t: 'Dairy' }, f.restaurant)).toBe(false)
    // A cemetery is checked against the cemetery's filters: none.
    expect(passesFields({ t: 'Jewish' }, f.cemetery)).toBe(true)
  })

  it('toggling a pick off again leaves the category with no filters at all', () => {
    const on = toggleSelect({}, 'restaurant', 't', 'Meat')
    expect(toggleSelect(on, 'restaurant', 't', 'Meat')).toEqual({})
    expect(toggleBool(toggleBool({}, 'mikvah', 'keilim'), 'mikvah', 'keilim')).toEqual({})
  })
})

describe('mapFilters — Open now, per category and for everything', () => {
  it('the top switch shows only when two or more categories showing keep hours', () => {
    expect(openNowAll({}, [food, shuls]).shown).toBe(false)
    expect(openNowAll({}, [food, grocery, shuls]).shown).toBe(true)
  })

  it('reads as on only when every one of them is; otherwise says which are', () => {
    const foodOnly = toggleOpenNow({}, 'restaurant')
    expect(openNowAll(foodOnly, [food, grocery, shuls])).toMatchObject({ on: false, onFor: ['Food'] })
    const both = toggleOpenNow(foodOnly, 'grocery')
    expect(openNowAll(both, [food, grocery, shuls])).toMatchObject({ on: true, onFor: [] })
  })

  it('on turns every category that keeps hours on; off turns them all off', () => {
    const on = setOpenNowFor({}, [food, grocery, shuls], true)
    expect(on).toEqual({ restaurant: { openNow: true }, grocery: { openNow: true } })
    expect(setOpenNowFor(on, [food, grocery, shuls], false)).toEqual({})
  })
})

describe('mapFilters — what’s on, as chips and a count', () => {
  it('names Open now once when it’s on for everything showing', () => {
    const f = toggleSelect(setOpenNowFor({}, [food, grocery], true), 'restaurant', 't', 'Meat')
    expect(activeFilters(f, [food, grocery, shuls]).map((a) => a.label)).toEqual(['Open now', 'Meat'])
    expect(filterCount(f, [food, grocery, shuls])).toBe(2)
  })

  it('names the category’s Open now when it’s on for only some', () => {
    const f = toggleOpenNow({}, 'restaurant')
    expect(activeFilters(f, [food, grocery]).map((a) => a.label)).toEqual(['Food open now'])
    // With only one category keeping hours, there's no top switch to tell
    // it apart from: just "Open now".
    expect(activeFilters(f, [food, shuls]).map((a) => a.label)).toEqual(['Open now'])
  })

  it('removing a chip switches just that one off', () => {
    const f = toggleSelect(toggleSelect({}, 'restaurant', 't', 'Meat'), 'restaurant', 'kosherCert', 'Keystone-K')
    const meat = activeFilters(f, [food]).find((a) => a.label === 'Meat')!
    expect(meat.remove(f)).toEqual({ restaurant: { select: { kosherCert: ['Keystone-K'] } } })
  })
})

describe('mapFilters — in the URL', () => {
  it('writes each filter with its category, and Open now for all of them as open=1', () => {
    const f = toggleBool(toggleSelect(setOpenNowFor({}, all, true), 'restaurant', 't', 'Meat'), 'mikvah', 'keilim')
    expect(writeMapFilters(f, all)).toEqual({ open: '1', is: 'mikvah.keilim', sel: 'restaurant.t:Meat' })
    expect(writeMapFilters(toggleOpenNow({}, 'restaurant'), all).open).toBe('restaurant')
  })

  it('reads back what it wrote', () => {
    const f = toggleSelect(toggleOpenNow(toggleBool({}, 'mikvah', 'keilim'), 'grocery'), 'restaurant', 't', 'Meat')
    const q = writeMapFilters(f, all)
    expect(readMapFilters(q, all)).toEqual(f)
  })

  it('an older link, keys with no category: the category it was opened for', () => {
    expect(readMapFilters({ open: '1', sel: 't:Meat' }, all, 'restaurant')).toEqual({
      restaurant: { openNow: true, select: { t: ['Meat'] } },
      grocery: { openNow: true },
      mikvah: { openNow: true },
    })
  })

  it('an older link opened for no one category: every category with that field', () => {
    expect(readMapFilters({ is: 'keilim' }, all)).toEqual({ mikvah: { bool: ['keilim'] } })
  })

  it('ignores junk', () => {
    expect(readMapFilters({ open: 'nowhere', is: ',', sel: 'nocolon,:x' }, all)).toEqual({})
  })
})
