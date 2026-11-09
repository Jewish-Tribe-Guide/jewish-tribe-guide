import { describe, expect, it } from 'vitest'
import type { CategoryField } from './categories'
import { automaticLines, cardFieldLine, cardPatch, lineSummary, onSecondLine, photoOnCard, reorderLine } from './cardLines'

const photo: CategoryField = { key: 'photo', label: 'Photo', type: 'image', renderAs: 'row' }
const hours: CategoryField = { key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row' }
const food: CategoryField = {
  key: 'food',
  label: 'Food Type',
  type: 'select',
  renderAs: 'badge',
  filterable: true,
  options: ['Meat', 'Dairy', 'Parve'].map((l) => ({ value: l.toLowerCase(), label: l })),
}
const cert: CategoryField = {
  key: 'cert',
  label: 'Kosher Certification',
  type: 'select',
  renderAs: 'badge',
  filterable: true,
  caveat: { flagField: 'partial', noteField: 'note' },
  options: ['IKC', 'OU', 'KCL', 'Star-K', 'CRC'].map((l) => ({ value: l, label: l })),
}
const short: CategoryField = { key: 'short', label: 'Short Description', type: 'text', showInHeader: true, headerMaxLength: 27 }
const about: CategoryField = { key: 'about', label: 'Description', type: 'textarea' }

describe('onSecondLine', () => {
  it('follows the rule from before when nobody chose: a badge with a filter', () => {
    expect(onSecondLine(food)).toBe(true)
    expect(onSecondLine({ ...food, filterable: false })).toBe(false)
    expect(onSecondLine({ ...food, renderAs: 'row' })).toBe(false)
  })

  it('is apart from the filter once chosen', () => {
    expect(onSecondLine({ ...food, onCard: false })).toBe(false)
    expect(onSecondLine({ ...food, renderAs: 'row', filterable: false, onCard: true })).toBe(true)
  })

  it('takes only yes/no and choice fields', () => {
    expect(onSecondLine({ ...short, onCard: true })).toBe(false)
    expect(onSecondLine({ ...hours, onCard: true })).toBe(false)
    expect(onSecondLine({ key: 'p', label: 'Partial', type: 'boolean', renderAs: 'hidden', onCard: true })).toBe(false)
  })
})

describe('the lines’ rows', () => {
  const page = { fields: [photo, short, food, cert, hours, about], hasAddress: true, upvotes: true }

  it('say what each line shows, in its order (board 20)', () => {
    expect(lineSummary(page, 'first')).toBe('Photo, Name · where it is, upvotes')
    expect(lineSummary(page, 'second')).toBe('Open or opens at, Distance, Food Type, Kosher Certification')
    expect(lineSummary(page, 'third')).toBe('Not everything here is kosher, Not confirmed by anyone yet, Short Description')
  })

  it('leave off what the page doesn’t have', () => {
    const shul = { fields: [photo, { key: 'm', label: 'Minyanim', type: 'minyanim' } as CategoryField], hasAddress: true, upvotes: false }
    expect(lineSummary(shul, 'first')).toBe('Photo, Name · where it is')
    expect(automaticLines(shul).third).toEqual(['Times not confirmed by anyone yet', 'Not confirmed by anyone yet'])
    const groups = { fields: [], hasAddress: false, upvotes: false }
    expect(lineSummary(groups, 'first')).toBe('Name')
    expect(lineSummary(groups, 'second')).toBe('Nothing in it yet')
  })

  it('drop the photo for initials once it’s off', () => {
    const off = { ...page, fields: [{ ...photo, onCard: false }, ...page.fields.slice(1)] }
    expect(photoOnCard(off.fields)).toBe(false)
    expect(lineSummary(off, 'first')).toBe('Name · where it is, upvotes')
    expect(cardPatch(photo, true)).toEqual({ onCard: true })
    expect(cardPatch(short, false)).toEqual({ showInHeader: false })
  })
})

describe('cardFieldLine', () => {
  it('names the choices, three at most (board 21)', () => {
    expect(cardFieldLine(food)).toBe('Meat, Dairy, Parve')
    expect(cardFieldLine(cert)).toBe('IKC, OU, KCL and 2 more')
    expect(cardFieldLine({ key: 'b', label: 'Delivers', type: 'boolean' })).toBe('Yes or no')
    expect(cardFieldLine(short)).toBe('Up to 27 letters')
    expect(cardFieldLine(about)).toBe('Text')
  })
})

describe('reorderLine', () => {
  it('moves a line’s fields among their own places and nothing else', () => {
    const fields = [photo, food, short, cert, about]
    expect(reorderLine(fields, ['cert', 'food']).map((f) => f.key)).toEqual(['photo', 'cert', 'short', 'food', 'about'])
  })
})
