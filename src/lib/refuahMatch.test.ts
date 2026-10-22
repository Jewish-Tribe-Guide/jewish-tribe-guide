import { describe, expect, it } from 'vitest'
import {
  MATCH_MILES,
  REFUAH_NOT_LISTED_CREATOR,
  givenLine,
  isHospitalWatch,
  isNotOnRefuah,
  nearestRefuah,
  notOnRefuahUrl,
  REFUAH_MATCH_CREATOR,
  matchLine,
  matchRefuah,
  refuahPageUrl,
  refuahWatchChanges,
  wantedRefuahWatches,
  type RefuahListed,
} from './refuahMatch'

// Refuah's own positions for three of Philly's hospitals (Oct 21).
const PENNSYLVANIA: RefuahListed = { _id: 'jx75q42dv17pxq7zckc9sx31v589mzem', name: 'Pennsylvania Hospital', formattedAddress: '800 Spruce St, Philadelphia, PA 19107', latitude: 39.9451, longitude: -75.1556 }
const CHOP: RefuahListed = { _id: 'jx74kxftmfs51n211388qzzpp189m2aj', name: "Children's Hospital of Philadelphia", latitude: 39.9481, longitude: -75.1937 }
const HUP: RefuahListed = { _id: 'jx77h9d00qztqgbbe8e0rfj1r589mgf5', name: 'Hospital of the University of Pennsylvania', latitude: 39.9496, longitude: -75.1925 }
const LIST = [PENNSYLVANIA, CHOP, HUP]

const at = (lat: number, lng: number) => ({ lat, lng })

describe('matchRefuah', () => {
  it('matches each hospital to the nearest one on Refuah, near enough to be the same building', () => {
    const m = matchRefuah(
      [
        { id: 'pa', name: 'Pennsylvania Hospital', geo: at(39.94515, -75.15565) },
        // CHOP is nearer HUP's front door than some of its own buildings: the nearest wins.
        { id: 'chop', name: 'CHOP - Main Building', geo: at(39.9484, -75.1940) },
      ],
      LIST,
    )
    expect(m.get('pa')).toMatchObject({ state: 'matched', refuah: { _id: PENNSYLVANIA._id } })
    expect(m.get('chop')).toMatchObject({ state: 'matched', refuah: { _id: CHOP._id } })
  })

  it('a hospital whose nearest is further than a couple of blocks is not matched', () => {
    // About half a mile west of CHOP.
    const m = matchRefuah([{ id: 'far', name: 'Somewhere', geo: at(39.9481, -75.2030) }], LIST).get('far')
    expect(m).toMatchObject({ state: 'too_far', nearest: { _id: CHOP._id } })
    expect(m?.state === 'too_far' && m.miles).toBeGreaterThan(MATCH_MILES)
  })

  it('two hospitals in the guide nearest the same record: the nearer one has it', () => {
    const m = matchRefuah(
      [
        { id: 'annex', name: 'Pennsylvania Hospital annex', geo: at(39.9460, -75.1560) },
        { id: 'main', name: 'Pennsylvania Hospital', geo: at(39.9451, -75.1557) },
      ],
      LIST,
    )
    expect(m.get('main')).toMatchObject({ state: 'matched' })
    expect(m.get('annex')).toEqual({ state: 'taken', refuah: PENNSYLVANIA, by: 'main' })
  })

  it('one with no map position, or a Refuah with no hospitals, is said as such', () => {
    expect(matchRefuah([{ id: 'x', name: 'X', geo: null }], LIST).get('x')).toEqual({ state: 'no_position' })
    expect(matchRefuah([{ id: 'x', name: 'X', geo: at(39.9, -75.1) }], []).get('x')).toEqual({ state: 'not_listed' })
  })
})

describe('wantedRefuahWatches and refuahWatchChanges', () => {
  const hospitals = [
    { id: 'pa', name: 'Pennsylvania Hospital', geo: at(39.9451, -75.1556) },
    { id: 'hup', name: 'HUP', geo: at(39.9496, -75.1925) },
    { id: 'far', name: 'Far', geo: at(40.2, -75.5) },
  ]
  const matches = matchRefuah(hospitals, LIST)

  it('one watch per matched hospital, on its Refuah page', () => {
    expect(wantedRefuahWatches(hospitals, matches, [])).toEqual([
      { url: refuahPageUrl(PENNSYLVANIA._id), resourceId: 'pa', label: 'Pennsylvania Hospital on Refuah' },
      { url: refuahPageUrl(HUP._id), resourceId: 'hup', label: 'HUP on Refuah' },
    ])
  })

  it('a hospital an admin gave a Refuah page of their own is left alone, even a different one', () => {
    const byHand = [{ id: 'w1', url: refuahPageUrl(CHOP._id), resourceId: 'hup', createdBy: 'admin@example.org' }]
    const wanted = wantedRefuahWatches(hospitals, matches, byHand)
    expect(wanted.map((w) => w.resourceId)).toEqual(['pa'])
    // And the run's own watch on that hospital goes.
    const own = { id: 'w2', url: refuahPageUrl(HUP._id), resourceId: 'hup', createdBy: REFUAH_MATCH_CREATOR }
    expect(refuahWatchChanges(wanted, [...byHand, own])).toEqual({ add: wanted, remove: ['w2'] })
  })

  it('a page already watched is not added twice; an admin’s watch is never removed', () => {
    const wanted = wantedRefuahWatches(hospitals, matches, [])
    const existing = [
      { id: 'mine', url: refuahPageUrl(PENNSYLVANIA._id), resourceId: 'pa', createdBy: REFUAH_MATCH_CREATOR },
      // An admin's watch on HUP's page, tied to no hospital.
      { id: 'theirs', url: refuahPageUrl(HUP._id), resourceId: null, createdBy: 'admin@example.org' },
      { id: 'gone', url: refuahPageUrl('jx7oldoldoldoldoldoldold'), resourceId: 'closed', createdBy: REFUAH_MATCH_CREATOR },
    ]
    expect(refuahWatchChanges(wanted, existing)).toEqual({ add: [], remove: ['gone'] })
  })
})

describe('matchLine and givenLine', () => {
  it('says which Refuah hospital it was matched to, by street, and how far, or why not', () => {
    const m = matchRefuah([{ id: 'pa', name: 'PA', geo: at(39.9451, -75.1556) }], LIST)
    expect(matchLine(m.get('pa'))).toBe('Matched to Refuah’s Pennsylvania Hospital, 800 Spruce St · same spot on the map')
    const near = matchRefuah([{ id: 'pa', name: 'PA', geo: at(39.9465, -75.1556) }], LIST)
    expect(matchLine(near.get('pa'))).toBe('Matched to Refuah’s Pennsylvania Hospital, 800 Spruce St · 0.1 mi apart on the map')
    expect(matchLine(matchRefuah([{ id: 'f', name: 'F', geo: at(39.9481, -75.2030) }], LIST).get('f'))).toBe(
      'Not found on Refuah. The nearest hospital on Refuah is 0.5 mi away, too far to be this one.',
    )
    expect(matchLine({ state: 'taken', refuah: CHOP, by: 'hup' }, new Map([['hup', 'HUP']]))).toBe(
      'Not found on Refuah. The nearest one, Children\'s Hospital of Philadelphia, is matched to HUP, which is nearer it.',
    )
    expect(matchLine({ state: 'no_position' })).toBe('Not on the map, so it can’t be matched to Refuah.')
  })

  it('a page given by hand says which Refuah hospital it is', () => {
    expect(givenLine(PENNSYLVANIA, at(39.9451, -75.1556))).toBe('Given by hand: Refuah’s Pennsylvania Hospital, 800 Spruce St · same spot on the map')
    expect(givenLine(CHOP, null)).toBe('Given by hand: Refuah’s Children\'s Hospital of Philadelphia')
    expect(givenLine(null, null)).toBe('Its Refuah page was given by hand.')
  })
})

describe('Not on Refuah', () => {
  it('a hospital said not to be on Refuah isn’t matched again', () => {
    const hospitals = [{ id: 'pa', name: 'Pennsylvania Hospital', geo: at(39.9451, -75.1556) }]
    const marker = { id: 'n', url: notOnRefuahUrl('pa'), resourceId: 'pa', createdBy: REFUAH_NOT_LISTED_CREATOR }
    expect(isNotOnRefuah(marker)).toBe(true)
    expect(wantedRefuahWatches(hospitals, matchRefuah(hospitals, LIST), [marker])).toEqual([])
    // Its address is no Refuah hospital's page, so nothing ever reads it.
    expect(isHospitalWatch(marker)).toBe(true)
    expect(isHospitalWatch({ url: 'https://bzbi.org/', createdBy: null })).toBe(false)
  })

  it('nearestRefuah lists the nearest few, nearest first', () => {
    expect(nearestRefuah(at(39.9484, -75.1940), LIST, 2).map((r) => r._id)).toEqual([CHOP._id, HUP._id])
    expect(nearestRefuah(null, LIST)).toEqual([])
  })
})
