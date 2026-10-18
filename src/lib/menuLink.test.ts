import { describe, expect, it } from 'vitest'
import { keepsMenuLink, readMenuLink } from './menuLink'
import { submitterDetails } from './syncFields'
import { makeCategory } from '@/test/providerFixtures'

const food = makeCategory({
  id: 'restaurant',
  detailFields: [{ key: 'dishes', label: 'Main dishes', type: 'tags', showCountInHeader: true, countLabel: 'main dish' }],
})
const grocery = makeCategory({
  id: 'grocery',
  detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags', showCountInHeader: true, countLabel: 'kosher item' }],
})

describe('keepsMenuLink', () => {
  it('is a category whose list is dishes; a grocery’s items have no menu', () => {
    expect(keepsMenuLink(food)).toBe(true)
    expect(keepsMenuLink(grocery)).toBe(false)
    expect(keepsMenuLink(makeCategory())).toBe(false)
    expect(keepsMenuLink(null)).toBe(false)
  })
})

describe('readMenuLink', () => {
  it('tidies an address as people type one', () => {
    expect(readMenuLink('  judah.example/menu ')).toBe('https://judah.example/menu')
    expect(readMenuLink('http://judah.example/menu.pdf')).toBe('http://judah.example/menu.pdf')
  })

  it('takes "" as taking the link off', () => {
    expect(readMenuLink('')).toBe('')
    expect(readMenuLink('   ')).toBe('')
  })

  it('refuses anything that isn’t a web page', () => {
    for (const bad of ['javascript:alert(1)', 'mailto:a@b.co', 'menu', 'see their menu online', 42, null, undefined, { url: 'x' }, `https://a.co/${'x'.repeat(2001)}`]) {
      expect(readMenuLink(bad)).toBeUndefined()
    }
  })
})

// The public submissions route takes the app's own keys off an incoming
// edit; a food place's menu link is a person's to suggest (Oct 17).
describe('submitterDetails and the menu link', () => {
  const ctx = { operation: 'update' as const, fieldKeys: ['dishes'], syncEligible: false }

  it('keeps a submitter’s menu link where the category keeps one, tidied', () => {
    expect(submitterDetails({ dishes: ['Falafel'], menuUrl: 'judah.example/menu' }, { ...ctx, keepsMenuLink: true })).toEqual({ dishes: ['Falafel'], menuUrl: 'https://judah.example/menu' })
    expect(submitterDetails({ menuUrl: '' }, { ...ctx, keepsMenuLink: true })).toEqual({ menuUrl: '' })
  })

  it('drops it everywhere else, and drops one that isn’t a web page', () => {
    expect(submitterDetails({ menuUrl: 'https://judah.example/menu' }, ctx)).toEqual({})
    expect(submitterDetails({ menuUrl: 'javascript:alert(1)' }, { ...ctx, keepsMenuLink: true })).toEqual({})
  })

  it('still drops the rest of the app’s keys beside it', () => {
    expect(submitterDetails({ menuUrl: 'https://a.example/m', itemMenu: { dishes: { Falafel: '2099-01-01' } } }, { ...ctx, keepsMenuLink: true })).toEqual({ menuUrl: 'https://a.example/m' })
  })
})
