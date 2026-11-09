import { describe, expect, it } from 'vitest'
import type { CategoryConfig, CategoryField } from './categories'
import { answerText, askedBefore, filterLook, listingLook, madeUpPlace, rowLook } from './fieldLooks'

const choices = (...values: string[]) => values.map((v) => ({ value: v, label: v }))
const foodType: CategoryField = { key: 'food_type', label: 'Food Type', type: 'select', renderAs: 'badge', filterable: true, onCard: true, options: choices('Meat', 'Dairy', 'Parve') }
const hechsher: CategoryField = { key: 'hechsher', label: 'Hechsher', type: 'select', renderAs: 'badge', filterable: true, onCard: true, options: choices('Keystone-K', 'OU') }
const kind: CategoryField = { key: 'type', label: 'Type', type: 'select', renderAs: 'badge', filterable: true, onCard: true, options: choices('Restaurant', 'Bakery') }
const delivery: CategoryField = { key: 'delivery', label: 'Delivery Details', type: 'textarea' }
const hours: CategoryField = { key: 'hours', label: 'Hours', type: 'hours', filterable: true }
const food = (fields: CategoryField[]): CategoryConfig => ({ id: 'food', label: 'Restaurant', pluralLabel: 'Food', icon: '', description: '', kind: 'listing', detailFields: fields })

describe('fieldLooks: a field on a made-up place', () => {
  const page = food([foodType, hechsher, kind, delivery, hours])
  const item = madeUpPlace(page, 'A restaurant')

  it('answers every field by its type', () => {
    expect(item.food_type).toBe('Meat')
    expect(answerText(hours, item.hours)).toContain('Mon–Thu 9:00 AM–9:00 PM')
    expect(item.delivery).toBeTruthy()
  })

  it('marks the field’s own part of the row, among its neighbours', () => {
    const row = rowLook(page, foodType, item)
    expect(row.facts.filter((p) => p.mine).map((p) => p.text)).toEqual(['Meat'])
    expect(row.facts.map((p) => p.text)).toEqual(expect.arrayContaining(['Keystone-K', 'Restaurant']))
    expect(row.onRow).toBe(true)
  })

  it('says hours as the row does, on a Wednesday afternoon', () => {
    expect(rowLook(page, hours, item).facts.filter((p) => p.mine).map((p) => p.text)).toEqual(['Open until 9 PM'])
  })

  it('knows a field off the row, and the line that would take it', () => {
    expect(rowLook(page, delivery, item)).toMatchObject({ onRow: false, canGoOn: 'third' })
    const off = { ...foodType, onCard: false }
    expect(rowLook(food([off, hechsher]), off, item)).toMatchObject({ onRow: false, canGoOn: 'second' })
    expect(rowLook(food([off]), off, item).facts).toEqual([])
    expect(rowLook(page, { ...hours, key: 'hours' }, item).canGoOn).toBeNull()
  })

  it('puts it where the listing does: the kind line, the facts, or a box', () => {
    expect(listingLook(page, kind, item)).toEqual({ at: 'kind', parts: [{ text: 'Restaurant', mine: true }] })
    const facts = listingLook(page, foodType, item)
    expect(facts.at).toBe('facts')
    expect(facts.at === 'facts' && facts.parts).toEqual([
      { text: 'Meat', mine: true },
      { text: 'Keystone-K', mine: false },
    ])
    expect(listingLook(page, delivery, item)).toMatchObject({ at: 'box', title: 'About', label: null })
    // A link's own box, and its words (Food's Delivery).
    const group: CategoryField = { key: 'group', label: 'Delivery WhatsApp Group', type: 'url', linkLabel: 'Join WhatsApp Group', leadBox: { title: 'Delivery', text: 'delivery' } }
    const withGroup = food([foodType, group, delivery, hours])
    expect(listingLook(withGroup, delivery, madeUpPlace(withGroup, 'A place'))).toMatchObject({ at: 'box', title: 'Delivery', label: 'Delivery Details' })
    expect(listingLook(withGroup, group, madeUpPlace(withGroup, 'A place'))).toMatchObject({ at: 'box', title: 'Delivery', text: 'Join WhatsApp Group' })
    expect(listingLook(page, hours, item)).toMatchObject({ at: 'box', title: 'Contact', label: 'Hours' })
    expect(listingLook(page, { ...delivery, renderAs: 'hidden' }, item)).toEqual({ at: 'none' })
  })

  it('is in Filters only while it’s in the filter', () => {
    expect(filterLook(page, foodType)).toEqual({ kind: 'chips', legend: 'Food Type', values: [{ text: 'Meat' }, { text: 'Dairy' }, { text: 'Parve' }] })
    expect(filterLook(page, { ...foodType, filterable: false })).toBeNull()
    expect(filterLook(page, hours)).toEqual({ kind: 'switch', label: 'Open now' })
    expect(filterLook(page, delivery)).toBeNull()
  })

  it('names the question asked just before it when adding, in the add form’s order', () => {
    // The kind of place first, then the facts that decide it.
    expect(askedBefore(page, kind, item)).toEqual({ label: 'Name', text: 'A restaurant' })
    expect(askedBefore(page, foodType, item)).toEqual({ label: 'Type', text: 'Restaurant' })
    // The address and phone before the hours.
    expect(askedBefore(page, hours, item)).toEqual({ label: 'Phone', text: '' })
  })
})
