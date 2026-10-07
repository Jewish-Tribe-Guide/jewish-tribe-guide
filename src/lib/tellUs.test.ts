import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { CategoryField } from './categories'
import { tellUsPlaceholder } from './tellUs'

// Each category's own example, from its fields as Philadelphia has them
// set up (Oct 5). Hotels used to get a store's and a shul's.
const f = (key: string, label: string, type: CategoryField['type']): CategoryField => ({ key, label, type })
const website = f('website', 'Website', 'url')
const photo = f('photo', 'Photo', 'image')

describe('tellUsPlaceholder', () => {
  it('names what a hotel keeps, not a store’s items or a shul’s times', () => {
    const hotel = makeCategory({ detailFields: [website, photo, f('shabbatFriendly', 'Shabbat friendly', 'boolean'), f('notes', 'Notes', 'textarea')] })
    expect(tellUsPlaceholder(hotel)).toBe('What did you see? A new place, or what changed at one: its phone or website. Or paste a post from the group.')
  })

  it('leads with hours and choices', () => {
    const mikvah = makeCategory({ detailFields: [f('hours', 'Hours', 'hours'), website, f('womenTevillah', 'Women’s Tevillah', 'boolean'), f('women_s_hours', 'Women’s Hours', 'hours'), f('men_s_hours', 'Men’s Hours', 'hours')] })
    expect(tellUsPlaceholder(mikvah)).toContain('its hours, women’s hours or men’s hours.')
    const food = makeCategory({ detailFields: [f('hours', 'Hours', 'hours'), website, f('t', 'Food Type', 'select'), f('kosherCert', 'Kosher Certification', 'select')] })
    expect(tellUsPlaceholder(food)).toContain('its hours, food type or kosher certification.')
  })

  it('gives a store’s items and a shul’s times their own, and the Minyanim view the times', () => {
    const shul = makeCategory({ detailFields: [website, f('denomination', 'Denomination', 'select'), f('minyanim', 'Davening Times', 'minyanim')] })
    expect(tellUsPlaceholder(shul)).toContain('its davening times, denomination or phone.')
    expect(tellUsPlaceholder(shul, { times: true })).toBe('Paste the shul’s email or this week’s times, or add a photo or PDF of the schedule.')
    expect(tellUsPlaceholder(makeCategory({ detailFields: [f('m', 'Kosher items', 'tags')] }))).toContain('“Trader Joe’s on Arch has kosher ground beef”')
  })

  it('says only what there is when a category keeps little', () => {
    expect(tellUsPlaceholder(makeCategory({ hasPhone: false, detailFields: [f('link', 'Join link', 'url')] }))).toBe('What did you see? A new place, or what changed at one. Or paste a post from the group.')
    expect(tellUsPlaceholder()).toContain('new hours, a new place')
  })
})
