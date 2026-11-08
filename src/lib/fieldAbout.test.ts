import { describe, expect, it } from 'vitest'
import { basicField, fieldAbout } from './fieldAbout'
import { readyCopy } from './readyMade'
import type { CategoryField } from './categories'

// The first box on a ready-made field's screen (canvas, Nov 7).
describe('fieldAbout', () => {
  it('uses a field’s written paragraph, by its name and kind', () => {
    expect(fieldAbout({ key: 'x', label: ' Food type ', type: 'select', options: [] }).about).toBe(
      'Whether a place is meat, dairy or parve. People adding a place pick one. Rows show it under the name.',
    )
    // Another kind by the same name isn't the same field.
    expect(fieldAbout({ key: 'x', label: 'Food Type', type: 'text' }).about).not.toContain('meat, dairy')
  })

  it('describes one without a paragraph by what its kind really does', () => {
    expect(fieldAbout({ key: 's', label: 'Size', type: 'select', multiSelect: true, allowOther: true, options: [] }).about).toBe(
      'One of a set of choices. People adding a place pick any that fit, or type another.',
    )
    expect(fieldAbout({ key: 'm', label: 'Menu', type: 'url', linkLabel: 'See the menu' }).about).toBe(
      'A link. People adding a place paste the link. The listing shows a button that says “See the menu”.',
    )
    // A list that's the page's main one says so; another list doesn't.
    expect(fieldAbout({ key: 'd', label: 'Dietary options', type: 'tags' }).about).not.toContain('Rows name a few')
    expect(fieldAbout({ key: 'd', label: 'Dietary options', type: 'tags', showCountInHeader: true }).about).toContain('Rows name a few')
  })

  it('lists a choice field’s choices, with Other, but not a page’s own', () => {
    const f: CategoryField = {
      key: 'd',
      label: 'Denomination',
      type: 'select',
      allowOther: true,
      options: [
        { value: 'O', label: 'Orthodox' },
        { value: 'C', label: 'Conservative' },
        { value: 'Chabad', label: 'Chabad', own: true },
      ],
    }
    expect(fieldAbout(f).choices).toEqual(['Orthodox', 'Conservative', 'Other, typed in'])
  })

  it('says what davening times come with', () => {
    expect(fieldAbout({ key: 'm', label: 'Davening Times (Minyanim)', type: 'minyanim' }).comesWith).toEqual(['Usual weekday times', 'Usual Shabbos times', 'This week’s schedule'])
  })

  it('describes a page’s basics before they’re added', () => {
    expect(fieldAbout(basicField('address')).about).toContain('It puts the place on the map')
    expect(fieldAbout(basicField('phone')).about).toContain('Call button')
  })
})

describe('readyCopy', () => {
  it('gives another page the field without what its page made its own', () => {
    const own: CategoryField = {
      key: 'd',
      label: 'Denomination',
      type: 'select',
      madeHere: true,
      options: [
        { value: 'O', label: 'Orthodox' },
        { value: 'Chabad', label: 'Chabad', own: true },
      ],
    }
    expect(readyCopy(own)).toEqual({ key: 'd', label: 'Denomination', type: 'select', options: [{ value: 'O', label: 'Orthodox' }] })
  })
})
