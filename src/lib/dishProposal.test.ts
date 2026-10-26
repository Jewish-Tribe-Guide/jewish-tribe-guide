import { describe, expect, it } from 'vitest'
import { dishProposal } from './dishProposal'

const dish = (name: string, quote = name.toUpperCase()) => ({ name, quote, checked: true, named: true })

describe('dishProposal', () => {
  // Charlie was a sinner. on dev, Oct 21: its menu names 9 of the 12 dishes
  // its listing has, each found on its menu by an earlier read.
  const listed = {
    dishes: ['Sliders', 'Tacos', 'Fried Calamari', 'Tofu', 'Zucchini Crabcake Slider', 'Beets'],
    menuDated: ['Sliders', 'Tacos', 'Fried Calamari', 'Tofu', 'Zucchini Crabcake Slider', 'Beets'],
  }

  it('crosses out a dish a reader found before that the menu no longer names, and Use this takes it off', () => {
    const p = dishProposal(listed, { dishes: [dish('Sliders'), dish('Tacos'), dish('Beets')], missing: ['Fried Calamari', 'Tofu', 'Zucchini Crabcake Slider'] })
    expect(p.rows.map((r) => [r.name, r.status])).toEqual([
      ['Fried Calamari', 'gone'],
      ['Tofu', 'gone'],
      ['Zucchini Crabcake Slider', 'gone'],
      ['Sliders', 'same'],
      ['Tacos', 'same'],
      ['Beets', 'same'],
    ])
    expect(p.always).toEqual(['Sliders', 'Tacos', 'Beets'])
    expect(p.updates).toBe(3)
    expect(p.pill).toBe('3 not on the menu')
  })

  it('never crosses out a dish added by hand: the reader missed it once, so missing it again says nothing', () => {
    const p = dishProposal({ dishes: ['Sliders', 'Laffa Wraps'], menuDated: ['Sliders'] }, { dishes: [dish('Sliders')], missing: ['Laffa Wraps'] })
    expect(p.rows.find((r) => r.name === 'Laffa Wraps')?.status).toBe('not_found')
    expect(p.always).toEqual(['Sliders', 'Laffa Wraps'])
    expect(p.updates).toBe(0)
    expect(p.pill).toBeNull()
  })

  it('highlights a new dish, adds it at the end, and names the kind on the pill', () => {
    const p = dishProposal({ dishes: ['Sliders'], menuDated: ['Sliders'] }, { dishes: [dish('Sliders'), dish('Kofta', 'TURKISH "LAMB" KOFTA')], missing: [] })
    expect(p.rows.find((r) => r.name === 'Kofta')).toMatchObject({ status: 'new', quote: 'TURKISH "LAMB" KOFTA' })
    expect(p.always).toEqual(['Sliders', 'Kofta'])
    expect(p.pill).toBe('1 new')
  })

  it('says "N updates" when it both adds and takes off', () => {
    const p = dishProposal(listed, { dishes: [dish('Sliders'), dish('Kofta')], missing: ['Tacos', 'Fried Calamari', 'Tofu', 'Zucchini Crabcake Slider', 'Beets'] })
    expect(p.pill).toBe('6 updates')
  })

  it('keeps what the reading didn’t look for, and a dish in "not always" where it was', () => {
    const p = dishProposal({ dishes: ['Sliders', 'Soup'], sometimes: ['Soup'], menuDated: ['Sliders', 'Soup'] }, { dishes: [dish('Sliders')] })
    expect(p.rows.find((r) => r.name === 'Soup')?.status).toBe('unchecked')
    expect(p.always).toEqual(['Sliders'])
    expect(p.sometimes).toEqual(['Soup'])
    expect(p.updates).toBe(0)
  })

  it('matches names whatever their case, keeping the listing’s spelling', () => {
    const p = dishProposal({ dishes: ['Bao Buns'], menuDated: ['Bao Buns'] }, { dishes: [dish('bao buns')], missing: [] })
    expect(p.rows).toEqual([expect.objectContaining({ name: 'Bao Buns', status: 'same' })])
    expect(p.always).toEqual(['Bao Buns'])
  })
})
