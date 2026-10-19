import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { Proposal } from './messageReader'
import { isCommunityEdit } from './submissionSource'
import {
  changedOn,
  filedBefore,
  hoursReads,
  isListingPageWatch,
  LISTING_PAGE_WATCH_CREATOR,
  LISTING_PAGE_WATCH_NAME,
  listingPageNote,
  listingPageSource,
  pageReadsFor,
  suggestionKey,
} from './listingPageWatch'

const shul = makeCategory({ id: 'synagogue', detailFields: [{ key: 'website', label: 'Website', type: 'url' }, { key: 'minyanim', label: 'Davening Times', type: 'minyanim' }] })
const mikvah = makeCategory({
  id: 'mikvah',
  detailFields: [
    { key: 'hours', label: 'Hours', type: 'hours' },
    { key: 'women_s_hours', label: 'Women’s Hours', type: 'hours' },
    { key: 'e', label: 'Email', type: 'text' },
  ],
})

describe('isListingPageWatch', () => {
  it('is only a watch an admin added as the listing’s own page', () => {
    expect(isListingPageWatch({ createdBy: LISTING_PAGE_WATCH_CREATOR })).toBe(true)
    expect(isListingPageWatch({ createdBy: 'admin@example.org' })).toBe(false)
    expect(isListingPageWatch({ createdBy: 'menu links' })).toBe(false)
  })
})

describe('pageReadsFor', () => {
  it('reads a shul’s page for its davening times, and a mikvah’s for every hours field', () => {
    expect(pageReadsFor(shul)).toEqual({ kind: 'times', key: 'minyanim' })
    expect(pageReadsFor(mikvah)).toEqual({ kind: 'hours', keys: ['hours', 'women_s_hours'] })
  })

  it('has nothing to read for a listing with neither', () => {
    expect(pageReadsFor(makeCategory({ detailFields: [{ key: 'website', label: 'Website', type: 'url' }] }))).toBeNull()
  })
})

describe('hoursReads', () => {
  const fields = (listingId: string | null, changes: Extract<Proposal, { kind: 'fields' }>['changes']): Proposal => ({
    kind: 'fields',
    listingId,
    asWritten: '',
    ask: null,
    changes,
    note: null,
    quote: '',
    checked: true,
  })
  const women = { key: 'women_s_hours', hours: { days: ['sun' as const], open: '19:00', close: '22:00', closed: false, when: 'every_week' as const } }

  it('keeps only the hours read for this listing', () => {
    const out = hoursReads(
      [fields('m1', [women, { key: 'e', value: 'new@mikvah.org' }]), fields('other', [women]), { kind: 'not_update', note: 'chat' }],
      'm1',
      ['hours', 'women_s_hours'],
    )
    expect(out).toEqual([women])
  })

  it('takes hours read for no place as this one’s, but not one it asked about', () => {
    expect(hoursReads([fields(null, [women])], 'm1', ['women_s_hours'])).toEqual([women])
    const asked = { ...fields(null, [women]), ask: { question: 'Which?', choices: [] } } as Proposal
    expect(hoursReads([asked], 'm1', ['women_s_hours'])).toEqual([])
  })
})

describe('the note and the source', () => {
  it('says it’s from their website, and the day the page changed', () => {
    const on = changedOn(Date.parse('2026-10-20T11:00:00Z'))
    expect(on).toBe('Oct 20')
    expect(listingPageNote('https://lms.org/times', on, ['Changed: mincha · Sun · 6:05pm, was 6:15pm', 'New: maariv · Mon · 9:00pm'])).toBe(
      'From their website, changed Oct 20: https://lms.org/times\n\nChanged: mincha · Sun · 6:05pm, was 6:15pm\nNew: maariv · Mon · 9:00pm',
    )
  })

  // The AI read it: never "automatic", the label code-read sources get.
  it('is read by AI, from their website, with the page beside it', () => {
    const s = listingPageSource('Lower Merion Synagogue', 'https://lms.org/times', 'Oct 20', 'Shacharis 6:45am')
    expect(s).toEqual({
      readBy: 'ai',
      from: 'Lower Merion Synagogue’s website',
      named: 'Lower Merion Synagogue',
      note: 'From their website, changed Oct 20: https://lms.org/times',
      original: 'Shacharis 6:45am',
    })
    expect(isCommunityEdit({ note: null, submitted_by: { name: LISTING_PAGE_WATCH_NAME }, payload: { source: s } })).toBe(false)
  })
})

describe('filedBefore', () => {
  const times = [
    { id: 'a', tefillah: 'shacharis', days: ['mon'], time: '6:45am' },
    { id: 'b', tefillah: 'mincha', days: ['sun'], time: '6:05pm' },
  ]
  const keys = ['minyanim', 'minyanim_schedules']

  it('knows the same times read again, with new ids and in another order', () => {
    const again = [
      { id: 'x', tefillah: 'mincha', days: ['sun'], time: '6:05pm' },
      { id: 'y', tefillah: 'shacharis', days: ['mon'], time: '6:45am' },
    ]
    expect(filedBefore([{ payload: { details: { minyanim: times, website: 'old' } } }], { minyanim: again, website: 'new' }, keys)).toBe(true)
  })

  it('files times that differ from anything filed before', () => {
    const later = [times[0], { ...times[1], time: '5:55pm' }]
    expect(filedBefore([{ payload: { details: { minyanim: times } } }], { minyanim: later }, keys)).toBe(false)
    expect(filedBefore([], { minyanim: times }, keys)).toBe(false)
    expect(filedBefore([{ payload: null }], { minyanim: times }, keys)).toBe(false)
  })

  it('compares only the fields the page keeps', () => {
    expect(suggestionKey({ hours: { sun: null }, e: 'a' }, ['hours'])).toBe(suggestionKey({ hours: { sun: null }, e: 'b' }, ['hours']))
    expect(suggestionKey({ hours: { sun: null } }, ['hours'])).not.toBe(suggestionKey({ hours: { sun: { open: '19:00', close: '22:00' } } }, ['hours']))
  })
})
