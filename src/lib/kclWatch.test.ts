import { describe, expect, it } from 'vitest'
import { isKclList, kclListLink, kclMatches, parseKclList } from './kclWatch'

// KCL's list of the places it certifies (the user, Nov 4: "Can we add [it]
// to our kashrut checks for the ones that are KCL?"): a PDF of names, no
// addresses, linked from kclkashrus.org's home page.

const listing = (id: string, name: string, certs: string[] = ['KCL'], status = 'approved') => ({ id, name, status, details: { kosherCert: certs } })

describe('isKclList', () => {
  it('KCL’s home page, which links its list', () => {
    expect(isKclList('https://www.kclkashrus.org/')).toBe(true)
    expect(isKclList('https://kclkashrus.org')).toBe(true)
    expect(isKclList('https://www.kclkashrus.org/consumer-info/')).toBe(false)
    expect(isKclList('https://keystone-k.org/establishments/')).toBe(false)
  })
})

describe('kclListLink', () => {
  it('finds the establishments PDF on its home page, not the party planners’', () => {
    const html = `<a href="https://www.kclkashrus.org/wp-content/uploads/2023/06/KCL-Approved-Party-Planners.pdf">Party planners</a>
      <a class="btn" href="/wp-content/uploads/2025/06/KCL-Establishments-June-2025.pdf">See Complete Listing</a>`
    expect(kclListLink(html, 'https://www.kclkashrus.org/')).toBe('https://www.kclkashrus.org/wp-content/uploads/2025/06/KCL-Establishments-June-2025.pdf')
    expect(kclListLink('<a href="/about">About</a>', 'https://www.kclkashrus.org/')).toBeNull()
  })
})

describe('parseKclList', () => {
  it('its date and one name a line, as the December 2025 list has them', () => {
    const text = 'KCL- Certified Establishments\nDecember 2025\n350 Degrees\nA Cut Above\n\nGelbstein\'s Bakery \nMike\'s Chicken Crunchers\n'
    expect(parseKclList(text)).toEqual({ updated: 'December 2025', entries: [{ name: '350 Degrees' }, { name: 'A Cut Above' }, { name: 'Gelbstein\'s Bakery' }, { name: 'Mike\'s Chicken Crunchers' }] })
  })

  // The list's pages each start with the last page's last few names, and
  // its reminder sits between them.
  it('each name once, and not its reminder', () => {
    const text = 'KCL- Certified Establishments\nDecember 2025\nCirca\nCoco Candy\nREMINDER\nDo not assume that an establishment/catering hall is under the KCL supervision unless they display a KCL certificate.\nCirca\nCoco Candy\nConfection Collection'
    expect(parseKclList(text).entries.map((e) => e.name)).toEqual(['Circa', 'Coco Candy', 'Confection Collection'])
  })

  it('no date when it has none', () => {
    expect(parseKclList('KCL- Certified Establishments\nAroma Bakery').updated).toBeNull()
  })
})

describe('kclMatches', () => {
  const entries = ['South Side Smokehouse', 'That Sushi Spot', "Gelbstein's Bakery", "Mike's Chicken Crunchers", 'Bagel King', 'Sprinkles North', 'Sprinkles South', 'Four Corners', 'Four Corners South', 'Authentic Kosher Chinese'].map((name) => ({ name }))

  it('each live KCL place by its name, as the four on live were named Nov 4', () => {
    const matched = kclMatches(entries, [
      listing('ss', 'Southside'),
      listing('sushi', 'That Sushi Spot - Lakewood'),
      listing('sushi2', 'That Sushi Spot | Lakewood'),
      listing('gb', "Gelbstein's Bakery", ['OU', 'cRc', 'KCL']),
      listing('mc', "Mike's Chicken - Kosher"),
    ])
    expect(Object.fromEntries(matched)).toEqual({ ss: 'South Side Smokehouse', sushi: 'That Sushi Spot', sushi2: 'That Sushi Spot', gb: "Gelbstein's Bakery", mc: "Mike's Chicken Crunchers" })
  })

  it('only places the guide says are KCL, and live', () => {
    expect(kclMatches(entries, [listing('akc', 'Authentic Kosher Chinese', ['OU']), listing('old', 'Southside', ['KCL'], 'archived')]).size).toBe(0)
  })

  it('never a guess: not a name two entries start with, nor one too short to tell', () => {
    expect(kclMatches(entries, [listing('sp', 'Sprinkles'), listing('b', 'Bagel'), listing('s', 'Sushi')]).size).toBe(0)
  })

  it('its own name over a longer one it starts', () => {
    expect(Object.fromEntries(kclMatches(entries, [listing('fc', 'Four Corners')]))).toEqual({ fc: 'Four Corners' })
  })
})
