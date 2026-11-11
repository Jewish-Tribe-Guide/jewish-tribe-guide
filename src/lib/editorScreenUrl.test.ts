import { describe, expect, it } from 'vitest'
import type { CategoryField } from './categories'
import { fieldFromRef, fieldRef, screenFromSearch, screenHref } from './editorScreenUrl'

const fields = [{ key: 'kosher', label: 'Kosher', type: 'text' }, { key: '', label: '', type: 'text' }] as CategoryField[]

describe('editorScreenUrl', () => {
  it('writes each screen into the address and reads it back', () => {
    const screens = [{}, { field: 'kosher' }, { field: '#1' }, { field: 'phone' }, { add: { at: 'list' as const } }, { add: { at: 'make' as const } }, { add: { at: 'list' as const }, into: 'contact' }, { add: { at: 'look' as const, id: 'select:denomination' } }, { line: 'second' as const }, { field: 'kosher', preview: true }, { field: 'kosher', remove: true }]
    for (const screen of screens) {
      const href = screenHref('/philly/admin/categories/cat:food', '', screen)
      expect(screenFromSearch(href.slice(href.indexOf('?') + 1 || href.length))).toEqual(screen)
    }
  })

  it('keeps the box an add was opened from only while adding', () => {
    expect(screenFromSearch('add=list&in=box:2')).toEqual({ add: { at: 'list' }, into: 'box:2' })
    expect(screenFromSearch('in=box:2')).toEqual({})
    expect(screenHref('/p', '?add=list&in=contact', { field: 'kosher' })).toBe('/p?field=kosher')
  })

  it('keeps the address’s other parameters, and drops a screen’s own', () => {
    expect(screenHref('/p', '?x=1&field=old&preview=1&remove=1', { field: 'kosher' })).toBe('/p?x=1&field=kosher')
    expect(screenHref('/p', '?field=old', {})).toBe('/p')
  })

  it('names a field by key, or by place until it has one', () => {
    expect(fieldRef(fields, 0)).toBe('kosher')
    expect(fieldRef(fields, 1)).toBe('#1')
    expect(fieldRef(fields, 'address')).toBe('address')
    expect(fieldFromRef(fields, 'kosher')).toBe(0)
    expect(fieldFromRef(fields, '#1')).toBe(1)
    expect(fieldFromRef(fields, '#2')).toBeNull()
    expect(fieldFromRef(fields, 'gone')).toBeNull()
    expect(fieldFromRef(fields, 'phone')).toBe('phone')
    expect(fieldFromRef(fields, undefined)).toBeNull()
  })
})
