import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  certsIn,
  compareMekor,
  findingKey,
  findingNote,
  isMekorList,
  mekorAgrees,
  parseMekorList,
  submissionKey,
  type GuideListing,
  type MekorEntry,
  type MekorFinding,
  type PendingCreate,
} from './mekorWatch'

// Mekor Habracha's Center City page as fetched Oct 18 ("Last Updated
// 2026-10-12", 78 places), with its scripts, styles and images taken out to
// keep the copy small; every card is as the page served it.
const html = fs.readFileSync(path.join(__dirname, '__fixtures__/mekor-center-city.html'), 'utf8')
const { updated, entries } = parseMekorList(html)
const bySlug = (slug: string) => entries.find((e) => e.slug === slug)!

// The live guide's food and grocery listings the same morning, approved and
// archived (ids made up, only the fields the watch reads), and the three
// places Keystone-K's watch already had in the queue.
const guide = JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__/mekor-guide-listings.json'), 'utf8')) as GuideListing[]
const keystonePending: PendingCreate[] = [
  { id: 'p1', name: 'Kosher Corner', address: '1601 N Broad St, Philadelphia, PA 19122', phone: '', details: { k: 'https://keystone-k.org/kosher/kosher-corner/' } },
  { id: 'p2', name: 'Kosher Dining at the University of Pennsylvania', address: '39th Street between Walnut and Locust Streets', phone: '215-573-7596', details: {} },
  { id: 'p3', name: 'Barbara and Harvey Brodsky Enrichment Center', address: '349 Montgomery Ave, Bala Cynwyd, PA 19004', phone: '', details: {} },
]

function listing(over: Partial<GuideListing> & { details?: Record<string, unknown> }): GuideListing {
  return {
    id: over.id ?? 'id-' + (over.name ?? 'x'),
    status: 'approved',
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

function entry(over: Partial<MekorEntry>): MekorEntry {
  return {
    slug: 'somewhere',
    url: 'https://www.mekorhabracha.org/post/somewhere',
    name: 'Somewhere',
    neighborhood: 'Center City & Vicinity',
    kinds: ['Restaurants'],
    supervision: 'Under IKC Supervision',
    certs: ['IKC'],
    address: '',
    phone: '',
    website: null,
    certificate: null,
    ...over,
  }
}

describe('isMekorList', () => {
  it('knows Mekor’s directory page, with or without www', () => {
    expect(isMekorList('https://www.mekorhabracha.org/center-city')).toBe(true)
    expect(isMekorList('https://mekorhabracha.org/center-city/')).toBe(true)
    expect(isMekorList('https://www.mekorhabracha.org/post/joy-cafe')).toBe(false)
    expect(isMekorList('https://example.org/center-city')).toBe(false)
  })
})

describe('parseMekorList', () => {
  it('reads every place once, and the date the list was last updated', () => {
    expect(entries).toHaveLength(78)
    expect(new Set(entries.map((e) => e.slug)).size).toBe(78)
    expect(updated).toBe('2026-10-12')
  })

  it('reads a card: name, neighbourhood, kinds, supervision, address, phone and links', () => {
    const e = bySlug('20th-street-pizza')
    expect(e).toMatchObject({
      name: '20th Street Pizza',
      url: 'https://www.mekorhabracha.org/post/20th-street-pizza',
      neighborhood: 'Center City & Vicinity',
      kinds: ['Restaurants'],
      supervision: 'Under IKC Supervision',
      certs: ['IKC'],
      address: 'Vegan Pizzeria 108 S 20th St',
      phone: '2153985748',
      website: 'http://www.20thstreet.pizza/',
    })
    expect(e.certificate).toMatch(/blackbird_20thst_certificate/)
  })

  it('decodes the page’s escaped characters', () => {
    expect(entries.some((e) => e.name === "Ben & Jerry's Ice Cream")).toBe(true)
    expect(entries.some((e) => e.name === 'Charlie Was a Sinner.')).toBe(true)
    expect(entries.some((e) => e.name === 'Casa Borinqueña')).toBe(true)
  })

  it('reads a card with no address and no certificate', () => {
    const chic = entries.find((e) => e.name === 'La Chic N Sweet')!
    expect(chic.address).toBe('')
    expect(chic.certs).toEqual(['Other Kosher'])
    const magical = entries.find((e) => e.name === 'Magical Sweet Shop')!
    expect(magical.certificate).toBeNull()
    expect(magical.certs).toEqual(['Keystone-K'])
  })

  it('does not depend on the hash in the page’s class names', () => {
    const rehashed = parseMekorList(html.replace(/__ijl0tG__/g, '__Zz9_x1__'))
    expect(rehashed.entries).toHaveLength(78)
    expect(rehashed.entries[0]).toEqual(entries[0])
  })
})

describe('certsIn', () => {
  it('reads each way Mekor writes a hechsher as the guide’s own option', () => {
    expect(certsIn('Under IKC Supervision')).toEqual(['IKC'])
    expect(certsIn('Under IKC Kosher Supervision')).toEqual(['IKC'])
    expect(certsIn('Under Keystone K Supervision')).toEqual(['Keystone-K'])
    expect(certsIn('Under Keystone-K Supervision, Parve, Pas Yisroel / Yoshon')).toEqual(['Keystone-K'])
    expect(certsIn('Under Cherry-K Supervision')).toEqual(['Cherry-K'])
    expect(certsIn('Under KCL Lakewood Supervision')).toEqual(['KCL'])
    expect(certsIn('Under Rabbi Amiram Gabbai/Beit Harambam Supervision')).toEqual(['Other Kosher'])
    expect(certsIn('')).toEqual([])
  })
})

// The comparison done by hand on Oct 18 (docs/where-things-stand.md, 6a) is
// what the first run should file.
describe('compareMekor on the Oct 18 list and guide', () => {
  const findings = compareMekor(entries, guide, keystonePending)
  const of = (kind: MekorFinding['kind']) => findings.filter((f) => f.kind === kind)
  const nameOf = (f: MekorFinding) => (f.kind === 'new' ? f.entry.name : f.listing.name)

  it('suggests the places on Mekor the guide lacks, and none Keystone-K’s watch already put in the queue', () => {
    expect(
      of('new')
        .filter((f) => f.kind === 'new' && !f.archived)
        .map(nameOf)
        .sort(),
    ).toEqual([
      'Cafe 613 at Temple Hillel',
      'Cinnaholic',
      'Kosher Experience - Evesham RD',
      'Kosher Experience - Marlton Tpke',
      'La Chic N Sweet',
      "Mike's Chicken",
      // Mekor's is the Cherry Hill shop; the guide's is Haddon Township's.
      'Primo Water Ice',
      "Shevy's Babka Paradise - Chabad at Penn",
      "Shevy's Babka Paradise - Spring Garden St",
      'Z Candy Bar',
    ])
  })

  it('says when the place Mekor lists is one the guide archived', () => {
    const archived = of('new').filter((f) => f.kind === 'new' && f.archived)
    expect(archived.map(nameOf).sort()).toEqual([
      'Nothing Bundt Cakes – Springfield',
      'PLNT Burger - The Fairway',
      "Rita's Water Ice - Roosevelt Mall",
      'Shtetl Kosher Restaurant',
    ])
    // Listed again as Mekor has it: PLNT Burger in Jenkintown as IKC.
    const plnt = archived.find((f) => nameOf(f) === 'PLNT Burger - The Fairway')!
    expect(plnt.details.kosherCert).toEqual(['IKC'])
    expect(findingNote(plnt, updated)).toMatch(/archived/i)
  })

  it('flags Magical Sweet Shop’s IKC, which Mekor doesn’t give it', () => {
    const magical = of('hechsher').find((f) => nameOf(f) === 'Magical Sweet Shop')!
    expect(magical).toMatchObject({ removed: ['IKC'], added: [] })
    expect(magical.details.kosherCert).toEqual([])
    const note = findingNote(magical, updated)
    expect(note).toContain('Under Keystone-K Supervision')
    expect(note).toMatch(/no hechsher/i)
  })

  it('adds the hechsher Mekor gives that the guide lacks, and never takes Keystone-K off', () => {
    const changes = of('hechsher').map((f) => f.kind === 'hechsher' && [nameOf(f), f.listing.address?.split(',')[0], f.removed, f.added])
    expect(changes).toEqual(
      expect.arrayContaining([
        ['Nothing Bundt Cakes', '1409 E Marlton Pike Ste 70', [], ['Cherry-K']],
        ['Nothing Bundt Cakes', '101 NJ-73 #147', [], ['Cherry-K']],
      ]),
    )
    expect(of('hechsher')).toHaveLength(3)
    for (const f of of('hechsher')) if (f.kind === 'hechsher') expect(f.removed).not.toContain('Keystone-K')
  })

  it('flags an IKC the guide shows for a place Mekor doesn’t list at all, and only that', () => {
    expect(of('only-here').map(nameOf)).toEqual(['Zevi’s Bakery'])
    const zevis = of('only-here')[0]
    expect(zevis.details.kosherCert).toEqual([])
    expect(findingNote(zevis, updated)).toMatch(/ahead of Mekor/)
  })

  it('files nothing else', () => {
    expect(findings).toHaveLength(10 + 4 + 3 + 1)
  })
})

describe('matching', () => {
  it('never matches by a link many places share', () => {
    // Cinnaholic's "certificate" on Mekor is Keystone-K's home page, which
    // the guide's Rita's in Cherry Hill shares: not the same place.
    const cinnaholic = entry({ slug: 'cinnaholic', name: 'Cinnaholic', certs: ['Cherry-K'], certificate: 'https://keystone-k.org/', address: '5002 Umbria Ave. Philadelphia, PA', phone: '8564445253' })
    const ritas = listing({ name: "Rita's Italian Ice & Frozen Custard", address: '877 Cooper Landing Rd #4', details: { kosherCert: 'Cherry-K', k: 'https://keystone-k.org/' } })
    expect(compareMekor([cinnaholic], [ritas], []).map((f) => f.kind)).toEqual(['new'])
  })

  it('matches by a certificate link only one place has, when something else agrees', () => {
    const cert = 'https://example.blob/mekor/joy-cafe.pdf'
    const joy = entry({ slug: 'joy-cafe', name: 'Joy Cafe', certificate: cert, address: '630 N 2nd St' })
    const ours = listing({ name: 'Joy Café & Bakery', address: '630 N 2nd St, Philadelphia', details: { kosherCert: 'IKC', k: cert } })
    expect(compareMekor([joy], [ours], [])).toEqual([])
    // The same link on a place with nothing else in common is a mistake in
    // one list or the other, not the same place.
    const stranger = listing({ name: 'Other Place', address: '1 Elsewhere Rd', details: { kosherCert: 'IKC', k: cert } })
    expect(compareMekor([joy], [stranger], []).map((f) => f.kind).sort()).toEqual(['new', 'only-here'])
  })

  it('needs the street number to agree when the names do', () => {
    const springfield = entry({ slug: 'nbc-springfield', name: 'Nothing Bundt Cakes – Springfield', certs: ['Keystone-K'], address: '1001 Baltimore Pike Suite 2, Springfield, PA' })
    const wynnewood = listing({ name: 'Nothing Bundt Cakes', address: '333 E Lancaster Ave', details: { kosherCert: 'Keystone-K' } })
    expect(compareMekor([springfield], [wynnewood], []).map((f) => f.kind)).toEqual(['new'])
  })

  it('reads a place on both as the same when only its phone and a word of its name agree', () => {
    const sushi = entry({ slug: 'that-sushi-spot', name: 'That Sushi Spot - LKWD NJ', certs: ['KCL'], address: 'Pickup Location: 250 N Highland Ave', phone: '7328027220' })
    const ours = listing({ name: 'That Sushi Spot | Lakewood', address: '214 Clifton Ave, Lakewood', phone: '(732) 802-7220', details: { kosherCert: ['KCL'] } })
    expect(compareMekor([sushi], [ours], [])).toEqual([])
  })

  it('prefers the guide’s live listing to an archived copy of it', () => {
    // Mekor gives a hechsher the guide lacks, so the match shows in what's filed.
    const bagel = entry({ slug: 'nyb', name: 'New York Bagel Bakery', certs: ['Keystone-K', 'Cherry-K'], address: '7555 Haverford Ave' })
    const live = listing({ id: 'live', name: 'New York Bagel Bakery', address: '7555 Haverford Ave', details: { kosherCert: 'Keystone-K' } })
    const old = listing({ id: 'old', status: 'archived', name: 'New York Bagel Bakery', address: '7555 Haverford Ave', details: { kosherCert: 'Keystone-K' } })
    const [f] = compareMekor([bagel], [old, live], [])
    expect(f.kind === 'hechsher' && f.listing.id).toBe('live')
  })

  it('carries no hechsher difference to a grocery, which has no hechsher field', () => {
    const giant = entry({ slug: 'giant', name: 'GIANT - Wynnewood Rd', kinds: ['Bakery'], certs: ['Keystone-K'], address: '50 E Wynnewood Rd' })
    const ours = listing({ category: 'grocery', name: 'GIANT', address: '50 E Wynnewood Rd, Wynnewood' })
    expect(compareMekor([giant], [ours], [])).toEqual([])
  })
})

// Oct 19: agreement left no date; now it moves the listing's forward.
describe('mekorAgrees', () => {
  it('is the live listings matched with nothing to suggest', () => {
    const cert = 'https://example.blob/mekor/joy-cafe.pdf'
    const joy = entry({ slug: 'joy-cafe', name: 'Joy Cafe', certificate: cert, address: '630 N 2nd St' })
    const ours = listing({ name: 'Joy Café & Bakery', address: '630 N 2nd St, Philadelphia', details: { kosherCert: 'IKC', k: cert } })
    expect(mekorAgrees([joy], [ours], compareMekor([joy], [ours], []))).toEqual([ours.id])
    // A different hechsher is a suggestion, not agreement.
    const otherCert = listing({ ...ours, details: { kosherCert: 'OU', k: cert } })
    expect(mekorAgrees([joy], [otherCert], compareMekor([joy], [otherCert], []))).toEqual([])
    // An archived listing isn't dated.
    const archived = listing({ ...ours, status: 'archived' })
    expect(mekorAgrees([joy], [archived], compareMekor([joy], [archived], []))).toEqual([])
  })
})

describe('what a new place is filed as', () => {
  it('Mekor’s hechsher, kind, levels, website and its own certificate', () => {
    const f = compareMekor(
      [
        entry({
          slug: 'chalavita',
          name: 'Chalavita',
          kinds: ['Catering', 'Dairy'],
          supervision: 'Under Keystone-K Supervision',
          certs: ['Keystone-K'],
          certificate: 'https://chalavita.com/cert.jpg',
          website: 'https://chalavita.com/',
          address: '198 Tomlinson Rd',
          phone: '9296661482',
        }),
      ],
      [],
      [],
    )[0]
    expect(f.kind).toBe('new')
    expect(f.details).toEqual({
      kosherCert: ['Keystone-K'],
      k: 'https://chalavita.com/cert.jpg',
      foodType: ['Catering'],
      t: ['Dairy'],
      website: 'https://chalavita.com/',
    })
  })

  it('without a "website" that isn’t the place’s own', () => {
    const findings = compareMekor(entries, guide, keystonePending)
    const site = (name: string) => findings.find((f) => f.kind === 'new' && f.entry.name === name)!.details.website
    expect(site('Cinnaholic')).toBeUndefined() // Keystone-K's home page
    expect(site('Primo Water Ice')).toBeUndefined() // "httpswww.primowaterice.com"
    expect(site('Z Candy Bar')).toBe('http://www.zcandybar.com/')
  })
})

describe('findingKey and submissionKey', () => {
  const findings = compareMekor(entries, guide, keystonePending)

  it('reads back the same key from what was filed, so nothing is filed twice', () => {
    for (const f of findings) {
      const filed =
        f.kind === 'new'
          ? { operation: 'create', target_id: null, payload: { details: f.details }, note: findingNote(f, updated) }
          : { operation: 'update', target_id: f.listing.id, payload: { details: f.details }, note: findingNote(f, updated) }
      expect(submissionKey(filed)).toBe(findingKey(f))
    }
  })

  it('gives every finding its own key', () => {
    expect(new Set(findings.map(findingKey)).size).toBe(findings.length)
  })
})
