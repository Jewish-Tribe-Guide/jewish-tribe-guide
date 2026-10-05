import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  baseName,
  compareKeystone,
  findingKey,
  findingNote,
  levelsIn,
  parseKeystoneList,
  submissionKey,
  type WatchedListing,
} from './keystoneWatch'

// Nine real entries from Keystone-K's page (fetched Oct 5), picked because
// each is written differently: certification on the same line or the next,
// in Hebrew, with no label at all, with a members' offer after it.
const html = fs.readFileSync(path.join(__dirname, '__fixtures__/keystone-establishments.html'), 'utf8')
const entries = parseKeystoneList(html)
const bySlug = (slug: string) => entries.find((e) => e.slug === slug)!

function listing(over: Partial<WatchedListing> & { details?: Record<string, unknown> }): WatchedListing {
  return {
    id: over.id ?? 'id-' + (over.name ?? 'x'),
    category: 'restaurant',
    name: 'Somewhere',
    address: null,
    phone: null,
    anchor_id: 'community',
    distance: null,
    ...over,
    details: over.details ?? {},
  }
}

describe('parseKeystoneList', () => {
  it('reads every entry once', () => {
    expect(entries.map((e) => e.slug).sort()).toEqual([
      'chalavita-kosher-dairy-catering',
      'cherry-grill',
      'deluxe-catering-philadelphia',
      'giant-wynnewood',
      'judah-mediterranian-grille',
      'new-york-bagel',
      'sababa-falafel',
      'shug-sisters',
      'the-kosher-grill-xfinity-center',
    ])
  })

  it('reads the certification, address and levels when they share a line', () => {
    const e = bySlug('new-york-bagel')
    expect(e.name).toBe('New York Bagel')
    expect(e.certification).toBe('Dairy – Cholov Stam, Pareve – Pas Yisroel')
    expect(e.levels).toEqual(['Dairy', 'Parve'])
    expect(e.address).toContain('7555 Haverford Ave.')
    expect(e.phone).toBe('215-840-6010')
  })

  it('reads a certification written on the line after its label, and leaves the members’ offer out', () => {
    const e = bySlug('cherry-grill')
    expect(e.certification).toBe('Glatt Kosher & Pas Yisroel')
    expect(e.levels).toEqual(['Meat'])
  })

  it('reads a certification written in Hebrew', () => {
    expect(bySlug('judah-mediterranian-grille').levels).toEqual(['Meat'])
  })

  it('reads an entry with no label and no address', () => {
    const e = bySlug('sababa-falafel')
    expect(e.levels).toEqual(['Parve'])
    expect(e.address).toBe('')
  })

  it('keeps the list’s sections', () => {
    expect(bySlug('giant-wynnewood').kinds).toContain('groceries')
    expect(bySlug('shug-sisters').kinds).toEqual(['miscellaneous'])
  })
})

describe('levelsIn', () => {
  it('ignores what is only available on request', () => {
    expect(levelsIn('Glatt Meat. Cholov Yisrael and Pas Yisrael are available upon request')).toEqual(['Meat'])
    expect(bySlug('deluxe-catering-philadelphia').levels).toEqual(['Meat'])
  })

  it('reads both halves of a split place', () => {
    expect(levelsIn('Deli – Glatt Kosher / Bakery – Pareve, Pas Yisroel')).toEqual(['Meat', 'Parve'])
  })
})

describe('baseName', () => {
  it('drops the branch, punctuation and filler words', () => {
    expect(baseName('The Kosher Grill – Xfinity Center')).toBe('grill')
    expect(baseName('Mia’s Meals – Falafel Bar')).toBe('mias meals')
    expect(baseName('Deluxe Kosher Catering Philadelphia')).toBe(baseName('Deluxe Catering Philadelphia'))
  })
})

describe('compareKeystone', () => {
  const others = (slugs: string[]) => entries.filter((e) => slugs.includes(e.slug))

  it('proposes the levels the list gives to a linked place that has none', () => {
    const bagel = listing({ name: 'New York Bagel Bakery', details: { kosherCert: 'Keystone-K', k: 'https://keystone-k.org/kosher/new-york-bagel/' } })
    const [f] = compareKeystone(others(['new-york-bagel']), [bagel])
    expect(f.kind).toBe('update')
    expect(f.kind === 'update' && f.details.t).toEqual(['Dairy', 'Parve'])
    expect(f.kind === 'update' && f.changes).toEqual(['Dairy, Parve'])
  })

  it('says nothing when the guide already agrees', () => {
    const grill = listing({
      name: 'Cherry Grill',
      details: { kosherCert: ['Keystone-K'], k: 'https://keystone-k.org/kosher/cherry-grill/', t: ['Meat'] },
    })
    expect(compareKeystone(others(['cherry-grill']), [grill])).toEqual([])
  })

  it('treats a renamed page as a moved link, not a lost hechsher', () => {
    const grill = listing({
      name: 'The Kosher Grill',
      address: '3601 S Broad St, Philadelphia, PA 19148, USA',
      details: { kosherCert: ['Keystone-K'], k: 'https://keystone-k.org/kosher/the-kosher-grill-wells-fargo-center/', t: ['Meat'] },
    })
    const [f] = compareKeystone(others(['the-kosher-grill-xfinity-center']), [grill])
    expect(f.kind).toBe('update')
    expect(f.kind === 'update' && f.changes).toEqual(['its Keystone-K page has moved'])
    expect(f.kind === 'update' && f.details.k).toBe('https://keystone-k.org/kosher/the-kosher-grill-xfinity-center/')
  })

  it('matches a shorter name at the same street number, and keeps a certificate link', () => {
    const cert = 'https://chalavita.com/cert.jpg'
    const chalavita = listing({
      name: 'Chalavita',
      address: '198 Tomlinson Rd, Philadelphia, PA 19116, USA',
      details: { kosherCert: ['Keystone-K'], k: cert, t: ['Dairy'] },
    })
    expect(compareKeystone(others(['chalavita-kosher-dairy-catering']), [chalavita])).toEqual([])
  })

  it('does not match the same name at a different street number', () => {
    const elsewhere = listing({ name: 'Cherry Grill', address: '900 Other Rd', details: { kosherCert: 'IKC' } })
    const findings = compareKeystone(others(['cherry-grill']), [elsewhere])
    expect(findings.map((f) => f.kind)).toEqual(['new'])
  })

  it('flags a place the guide says Keystone-K certifies that the list no longer has', () => {
    const brazilian = listing({
      name: 'The Brazilian BBQ',
      details: { kosherCert: ['Keystone-K'], k: 'https://keystone-k.org/kosher/rio-kosher-by-brazilian-kosher/', t: ['Meat'] },
    })
    const [f] = compareKeystone(others(['cherry-grill']), [brazilian]).filter((x) => x.kind === 'gone')
    expect(f.kind === 'gone' && f.details.kosherCert).toEqual([])
    expect(f.kind === 'gone' && 'k' in f.details).toBe(false)
    expect(f.kind === 'gone' && f.details.t).toEqual(['Meat'])
  })

  it('leaves alone a place certified by someone else', () => {
    const ikc = listing({ name: 'HipCityVeg', details: { kosherCert: 'IKC' } })
    expect(compareKeystone([], [ikc])).toEqual([])
  })

  it('proposes places on the list the guide lacks, but not products or wholesalers', () => {
    const findings = compareKeystone(others(['sababa-falafel', 'giant-wynnewood', 'shug-sisters']), [])
    expect(findings.map((f) => (f.kind === 'new' ? [f.entry.slug, f.category] : f.kind))).toEqual([
      ['giant-wynnewood', 'grocery'],
      ['sababa-falafel', 'restaurant'],
    ])
    const sababa = findings[1]
    expect(sababa.kind === 'new' && sababa.details).toMatchObject({
      kosherCert: ['Keystone-K'],
      k: 'https://keystone-k.org/kosher/sababa-falafel/',
      t: ['Parve'],
    })
  })

  it('finds a grocery the guide has under its plain chain name', () => {
    const giant = listing({ category: 'grocery', name: 'GIANT', address: '50 E Wynnewood Rd, Wynnewood, PA 19096, USA' })
    expect(compareKeystone(others(['giant-wynnewood']), [giant])).toEqual([])
  })
})

describe('the note and the key', () => {
  const bagel = listing({ id: 'b1', name: 'New York Bagel Bakery', details: { kosherCert: 'Keystone-K', k: 'https://keystone-k.org/kosher/new-york-bagel/' } })
  const gone = listing({ id: 'g1', name: 'Shtetl', details: { kosherCert: 'Keystone-K' } })
  const findings = compareKeystone(entries.filter((e) => e.slug === 'new-york-bagel' || e.slug === 'sababa-falafel'), [bagel, gone])

  it('quotes the list and links to it', () => {
    const update = findings.find((f) => f.kind === 'update')!
    const note = findingNote(update)
    expect(note).toContain('Certification: "Dairy – Cholov Stam, Pareve – Pas Yisroel"')
    expect(note).toContain('https://keystone-k.org/kosher/new-york-bagel/')
    expect(findingNote(findings.find((f) => f.kind === 'gone')!)).toContain('Approving takes Keystone-K off this place')
  })

  it('reads the same key back from the suggestion it became, so a rejected one is not made again', () => {
    expect(findings.map((f) => f.kind).sort()).toEqual(['gone', 'new', 'update'])
    for (const f of findings) {
      const note = findingNote(f)
      const asSubmission =
        f.kind === 'new'
          ? { operation: 'create', target_id: null, payload: { details: f.details }, note }
          : { operation: 'update', target_id: f.listing.id, payload: { details: f.details }, note }
      expect(submissionKey(asSubmission)).toBe(findingKey(f))
    }
  })

  it('remembers a new grocery, which has no certificate link, by the link in its note', () => {
    const [giant] = compareKeystone([bySlug('giant-wynnewood')], [])
    expect(giant.kind === 'new' && 'k' in giant.details).toBe(false)
    expect(submissionKey({ operation: 'create', target_id: null, payload: { details: giant.details }, note: findingNote(giant) })).toBe(
      findingKey(giant),
    )
  })

  it('makes a new key when the list changes what it would propose', () => {
    const before = findings.find((f) => f.kind === 'update')!
    const after = compareKeystone(
      [{ ...bySlug('new-york-bagel'), levels: ['Dairy'] }],
      [bagel],
    )[0]
    expect(findingKey(after)).not.toBe(findingKey(before))
  })
})
