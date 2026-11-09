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

  // The user, Nov 9, field by field: each says what it's for.
  it('says what the reviewed fields are for', () => {
    expect(fieldAbout({ key: 'isKosher', label: 'Kosher Store', type: 'select', options: [] }).about).toMatch(/^Whether a store is fully kosher, or isn’t but carries some kosher items\./)
    expect(fieldAbout({ key: 'size', label: 'Size', type: 'select', options: [] }).about).toMatch(/^How big a sukkah is/)
    expect(fieldAbout({ key: 'keilim', label: 'Keilim', type: 'boolean' }).about).toMatch(/keilim mikvah/)
    expect(fieldAbout({ key: 'w', label: 'Women’s Email', type: 'text' }).about).toMatch(/mikvah’s women’s side/)
    expect(fieldAbout({ key: 's', label: 'Short Description', type: 'text', showInHeader: true }).about).toMatch(/under its name on its row/)
  })

  it('describes one without a paragraph by what its kind really does', () => {
    expect(fieldAbout({ key: 's', label: 'Seating', type: 'select', multiSelect: true, allowOther: true, options: [] }).about).toBe(
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

  it('lists Other once: a choice only called Other goes when Other is typed in', () => {
    const f: CategoryField = { key: 'd', label: 'Denomination', type: 'select', allowOther: true, options: [{ value: 'O', label: 'Orthodox' }, { value: 'Other', label: 'Other' }] }
    expect(fieldAbout(f).choices).toEqual(['Orthodox', 'Other, typed in'])
    expect(fieldAbout({ ...f, allowOther: false }).choices).toEqual(['Orthodox', 'Other'])
  })

  // The user, Nov 9: Kosher Certification had "Other Kosher" as well as a
  // typed-in Other.
  it('drops a catch-all “Other …” choice too when Other is typed in', () => {
    const f: CategoryField = { key: 'kosherCert', label: 'Kosher Certification', type: 'select', allowOther: true, options: [{ value: 'OU', label: 'OU' }, { value: 'Other Kosher', label: 'Other Kosher' }, { value: 'Others Inc', label: 'Otherside' }] }
    expect(fieldAbout(f).choices).toEqual(['OU', 'Otherside', 'Other, typed in'])
  })

  // The two hidden Food fields belong to the hechsher: shown on its screen.
  it('says a hechsher comes with whether everything is kosher and what isn’t', () => {
    const f: CategoryField = { key: 'k', label: 'Kosher Certification', type: 'select', caveat: { flagField: 'p', noteField: 'n' }, options: [{ value: 'OU', label: 'OU' }] }
    expect(fieldAbout(f).comesWith).toEqual(['Everything here is kosher?', 'What isn’t kosher'])
    expect(fieldAbout(f).about).toContain('Which hechsher')
    expect(fieldAbout({ ...f, caveat: { ...f.caveat!, title: 'Not under the hechsher' } }).comesWith).toEqual(['Everything here is kosher?', 'Not under the hechsher'])
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
