import { describe, expect, it } from 'vitest'
import { markTimes, submissionSource, timesIn } from './submissionSource'
import { KEYSTONE_WATCH_NAME } from './keystoneWatch'
import { GOOGLE_SUBMITTER_NAME } from './activity'

const sub = (note: string | null, name?: string, payload: Record<string, unknown> = {}) => ({
  note,
  submitted_by: name ? { name } : null,
  payload,
})

describe('submissionSource', () => {
  // The exact note the shul card's "Update their times" files
  // (api/resource/[id]/times): the reader's summary, then the pasted words,
  // then the photo it kept.
  it('reads the shul card’s paste and photo as read by AI, the original apart from the summary', () => {
    const note = [
      'Times for particular days, sent from the shul’s card.',
      'Fri Oct 2: Mincha 6:20 PM',
      'Read from what they pasted:\nFriday 6:20pm Mincha\nShabbat 9:15am',
      'Read from their photo or PDF: https://x.supabase.co/storage/v1/object/public/site-assets/schedule-source/a.jpg',
    ].join('\n\n')
    expect(submissionSource(sub(note))).toEqual({
      readBy: 'ai',
      from: 'what they pasted',
      original: 'Friday 6:20pm Mincha\nShabbat 9:15am',
      photoUrl: 'https://x.supabase.co/storage/v1/object/public/site-assets/schedule-source/a.jpg',
      note: 'Times for particular days, sent from the shul’s card.\n\nFri Oct 2: Mincha 6:20 PM',
    })
  })

  it('says “their photo” when a photo is all it was read from', () => {
    const s = submissionSource(sub('Their schedule, sent from the shul’s card.\n\nRead from their photo or PDF: https://x/a.png'))
    expect(s).toMatchObject({ readBy: 'ai', from: 'their photo', photoUrl: 'https://x/a.png' })
    expect(s.original).toBeUndefined()
  })

  it('shows a watch’s quote of the list as the original, read by the site, not AI', () => {
    expect(submissionSource(sub('Keystone-K’s list says: "Mama’s"', KEYSTONE_WATCH_NAME))).toEqual({
      readBy: 'automatic',
      from: 'Keystone-K’s list',
      original: 'Keystone-K’s list says: "Mama’s"',
    })
    expect(submissionSource(sub('Closed on Google', GOOGLE_SUBMITTER_NAME))).toMatchObject({ readBy: 'automatic', from: 'Google' })
  })

  it('treats anything else as a person’s suggestion, with their note', () => {
    expect(submissionSource(sub('They close early Fridays now', 'Dana'))).toEqual({ readBy: 'person', from: 'a visitor', note: 'They close early Fridays now' })
    expect(submissionSource(sub(null))).toEqual({ readBy: 'person', from: 'a visitor' })
  })

  it('prefers a well-formed source a filer stated, and ignores a malformed one', () => {
    const stated = { readBy: 'ai', from: 'their newsletter', original: 'Mincha 6:20pm', extra: 1 }
    expect(submissionSource(sub('x', undefined, { source: stated }))).toEqual({ readBy: 'ai', from: 'their newsletter', original: 'Mincha 6:20pm' })
    expect(submissionSource(sub('x', undefined, { source: { readBy: 'robot', from: 'y' } }))).toMatchObject({ readBy: 'person' })
    expect(submissionSource(sub('x', undefined, { source: 'ai' }))).toMatchObject({ readBy: 'person' })
  })
})

describe('markTimes', () => {
  const minyanim = [
    { tefillah: 'mincha', days: ['fri'], time: '6:20 PM' },
    { tefillah: 'shacharis', days: ['sat'], time: '09:15' },
  ]

  it('marks each clock time as used when the proposal has it, and counts the rest', () => {
    const { parts, unused } = markTimes('6:23pm Candle Lighting\n6:20pm Mincha\n9:15am Shacharit', { minyanim })
    expect(parts.filter((p) => p.mark)).toEqual([
      { text: '6:23pm', mark: 'unused' },
      { text: '6:20pm', mark: 'used' },
      { text: '9:15am', mark: 'used' },
    ])
    expect(unused).toBe(1)
    expect(parts.map((p) => p.text).join('')).toBe('6:23pm Candle Lighting\n6:20pm Mincha\n9:15am Shacharit')
  })

  it('reads “2:00 PM”, “2 p.m.” and a bare “6:20” the way an email writes them', () => {
    const { parts } = markTimes('Mincha 2 p.m. or 2:00 PM; Maariv 6:20', [{ time: '14:00' }, { time: '6:20 PM' }])
    expect(parts.filter((p) => p.mark).map((p) => p.mark)).toEqual(['used', 'used', 'used'])
  })

  it('leaves times without a clock alone', () => {
    expect(markTimes('15 min before sunset', []).parts).toEqual([{ text: '15 min before sunset' }])
  })

  it('doesn’t take a date or a phone number for a time', () => {
    expect(timesIn('Oct 2, 215-555-0100, 7598 Haverford').size).toBe(0)
  })
})
