import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { CategoryField } from './categories'
import { listLine, matchesSearch, pageMenu, pageToCopy, readyMadeFields, readyMadePages } from './readyMade'

const denomination = (options: string[]): CategoryField => ({
  key: 'denomination',
  label: 'Denomination',
  type: 'select',
  options: options.map((o) => ({ value: o, label: o })),
})
const shuls = makeCategory({
  id: 'synagogue',
  pluralLabel: 'Synagogues',
  detailFields: [
    { key: 'photo', label: 'Photo', type: 'image' },
    denomination(['Orthodox', 'Conservative', 'Reform', 'Reconstructionist']),
    { key: 'minyanim', label: 'Davening Times (Minyanim)', type: 'minyanim' },
    { key: 'website', label: 'Website', type: 'url' },
  ],
})
const schools = makeCategory({ id: 'school', pluralLabel: 'Schools', hasPhone: false, detailFields: [{ ...denomination(['Orthodox']), key: 'd' }] })
const food = makeCategory({
  id: 'restaurant',
  pluralLabel: 'Food',
  detailFields: [
    { key: 'kosher', label: 'Kosher Certification', type: 'select', options: [{ value: 'IKC', label: 'IKC' }], caveat: { flagField: 'kosherPartial', noteField: 'kosherNote' } },
    { key: 'kosherPartial', label: 'Not everything here is kosher', type: 'boolean', renderAs: 'hidden' },
    { key: 'kosherNote', label: 'What is the exception?', type: 'textarea', renderAs: 'hidden' },
    { key: 'short', label: 'Short Description', type: 'text', showInHeader: true },
  ],
})
const everywhere = [
  { community: 'philly', category: shuls },
  { community: 'philly', category: schools },
  { community: 'dc', category: food },
  { community: 'dc', category: makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues', detailFields: [] }) },
]
const bare = { hasAddress: false, hasPhone: false, fields: [] }

describe('listLine', () => {
  it('names up to three, then says how many more', () => {
    expect(listLine(['A'])).toBe('A')
    expect(listLine(['A', 'B', 'C'])).toBe('A, B and C')
    expect(listLine(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C and 2 more')
  })
})

describe('readyMadePages', () => {
  it('lists each page once by name, its own community’s copy first, with its own fields as the line', () => {
    const rows = readyMadePages(everywhere, [], 'philly')
    expect(rows.map((r) => [r.pluralLabel, r.line])).toEqual([
      ['Food', 'Kosher Certification, Short Description'],
      ['Schools', 'Denomination'],
      ['Synagogues', 'Denomination, Davening Times (Minyanim)'],
    ])
    expect(rows.find((r) => r.id === 'synagogue')!.source).toBe(shuls)
  })

  it('leaves out a page with no fields of its own', () => {
    const rows = readyMadePages([{ community: 'dc', category: makeCategory({ id: 'seed', detailFields: [{ key: 'website', label: 'Website', type: 'url' }] }) }], [], 'philly')
    expect(rows).toEqual([])
  })

  it('says which the community already has, by address or by name', () => {
    const rows = readyMadePages(everywhere, [makeCategory({ id: 'shuls', pluralLabel: 'Synagogues' })], 'philly')
    expect(rows.map((r) => r.ownId)).toEqual([null, null, 'shuls'])
  })

  it('copies a page without its community’s photos or nearby lists', () => {
    const copy = pageToCopy(makeCategory({ cardImageUrl: 'x', cardBandImageUrl: 'y', iconImageUrl: 'z', active: false, walkList: [] as never }))
    expect(copy).toMatchObject({ cardImageUrl: null, cardBandImageUrl: null, iconImageUrl: null, active: true, walkList: undefined })
  })
})

describe('readyMadeFields', () => {
  it('lists every field once, with the pages it’s on and what it holds, and the basics as Most pages', () => {
    const rows = readyMadeFields(everywhere, bare)
    expect(rows.map((r) => [r.label, r.line])).toEqual([
      ['Address', 'Most pages · puts the page on the map'],
      ['Davening Times (Minyanim)', 'Synagogues'],
      ['Denomination', 'Schools, Synagogues · Orthodox, Conservative, Reform and 1 more'],
      ['Hours', 'Most pages'],
      ['Kosher Certification', 'Food · IKC'],
      ['Phone', 'Most pages'],
      ['Short Description', 'Food · a line under the name'],
      ['Website', 'Most pages'],
    ])
  })

  it('leaves out what the page already has', () => {
    const rows = readyMadeFields(everywhere, { hasAddress: true, hasPhone: false, fields: [{ key: 'x', label: 'denomination ', type: 'select' }, { key: 'website', label: 'Website', type: 'url' }] })
    expect(rows.map((r) => r.label)).not.toContain('Denomination')
    expect(rows.map((r) => r.label)).not.toContain('Address')
    expect(rows.map((r) => r.label)).not.toContain('Website')
  })

  it('on one page’s menu, gives only that page’s fields and basics', () => {
    expect(readyMadeFields(everywhere, bare, 'Schools').map((r) => r.label)).toEqual(['Address', 'Denomination'])
  })

  it('brings a caveat’s flag and note with its field', () => {
    const kosher = readyMadeFields(everywhere, bare).find((r) => r.label === 'Kosher Certification')!
    expect(kosher.companions?.map((f) => f.key)).toEqual(['kosherPartial', 'kosherNote'])
  })

  it('names up to three pages on a field’s line', () => {
    const page = (n: string) => ({ community: 'dc', category: makeCategory({ id: n, pluralLabel: n, detailFields: [{ key: 'd', label: 'Description', type: 'textarea' }] }) })
    expect(readyMadeFields(['A', 'B', 'C', 'D', 'E'].map(page), bare).find((r) => r.label === 'Description')!.line).toBe('A, B, C and 2 more · text')
  })

  it('names the page menu’s pages once each', () => {
    expect(pageMenu(everywhere)).toEqual(['Food', 'Schools', 'Synagogues'])
  })

  it('searches by every word typed, in the name or the line', () => {
    expect(matchesSearch({ label: 'Kosher Store', line: 'Grocery · a list' }, 'kosher groc')).toBe(true)
    expect(matchesSearch({ label: 'Kosher Store', line: 'Grocery' }, 'parking')).toBe(false)
  })
})
