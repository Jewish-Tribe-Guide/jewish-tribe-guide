import { describe, expect, it } from 'vitest'
import {
  isIgnoredSender,
  isNewsletterWatch,
  NEWSLETTER_IGNORED_CREATOR,
  NEWSLETTER_WATCH_CREATOR,
  newsletterText,
  newsletterUrl,
  quietError,
  senderAddress,
  senderName,
  timesWereRead,
} from './newsletter'
import type { UpdateRow } from './scheduleUpdate'

describe('a sender', () => {
  it('is the address in the From header, lower case', () => {
    expect(senderAddress('"Young Israel" <Office@YIOC.org>')).toBe('office@yioc.org')
    expect(senderAddress('Young Israel <office@yioc.org>')).toBe('office@yioc.org')
    expect(senderAddress('office@yioc.org')).toBe('office@yioc.org')
    expect(senderAddress('Young Israel')).toBeNull()
    expect(senderAddress('')).toBeNull()
  })

  it('has a name when the header gives one', () => {
    expect(senderName('"Young Israel" <office@yioc.org>')).toBe('Young Israel')
    expect(senderName('Mekor Habracha <info@mekorhabracha.org>')).toBe('Mekor Habracha')
    expect(senderName('office@yioc.org')).toBeNull()
  })

  it('is watched at its mailto: address, and an ignored one is told apart', () => {
    const url = newsletterUrl('Office@YIOC.org')
    expect(url).toBe('mailto:office@yioc.org')
    expect(isNewsletterWatch({ createdBy: NEWSLETTER_WATCH_CREATOR, url })).toBe(true)
    expect(isNewsletterWatch({ createdBy: NEWSLETTER_IGNORED_CREATOR, url })).toBe(false)
    expect(isIgnoredSender({ createdBy: NEWSLETTER_IGNORED_CREATOR, url })).toBe(true)
    // An admin's own page watch is never one, whoever added it.
    expect(isNewsletterWatch({ createdBy: NEWSLETTER_WATCH_CREATOR, url: 'https://yioc.org/' })).toBe(false)
    expect(isNewsletterWatch({ createdBy: 'me@x.co', url })).toBe(false)
  })
})

describe('newsletterText', () => {
  it('takes out a mailing list’s links, so the times fit in the reader’s window', () => {
    const mailchimp = [
      'Shabbos Times',
      'View this email in your browser ( https://us5.campaign-archive.com/?e=abc&u=1234567890&id=99 )',
      '',
      '',
      '',
      'Mincha 6:05pm <https://yioc.org/r?u=tracking>',
      'Shacharis 9:00am [https://yioc.org/x]',
      'https://click.mailchimp.com/track/click/30010842/yioc.org?p=eyJzIjoiSFlVRlBuSUdDOWxGNDBkTlFhb3RyZnRqb3Jv',
    ].join('\n')
    expect(newsletterText(mailchimp)).toBe('Shabbos Times\nView this email in your browser\n\nMincha 6:05pm\nShacharis 9:00am')
  })

  it('cuts a long one to the window', () => {
    expect(newsletterText('a'.repeat(20_000))).toHaveLength(8_000)
  })
})

describe('timesWereRead', () => {
  const row = (status: UpdateRow['status']) => ({ id: status, day: 'sat', tefillah: 'mincha', time: '6:00pm', status }) as UpdateRow
  it('is true only when the reader found a time', () => {
    expect(timesWereRead({ rows: [row('same')] })).toBe(true)
    expect(timesWereRead({ rows: [row('changed'), row('gone')] })).toBe(true)
    expect(timesWereRead({ rows: [row('new')] })).toBe(true)
    // A newsletter with no times read as "every minyan is gone" must not
    // count as a reading.
    expect(timesWereRead({ rows: [row('gone'), row('gone'), row('kept')] })).toBe(false)
    expect(timesWereRead({ rows: [] })).toBe(false)
  })
})

describe('quietError', () => {
  const now = Date.parse('2026-11-20T12:00:00Z')
  it('is nothing for a newsletter heard from this month', () => {
    expect(quietError('2026-11-01T12:00:00Z', '2026-10-01T00:00:00Z', now)).toBeNull()
  })
  it('says since when once it has gone quiet a month', () => {
    expect(quietError('2026-10-15T12:00:00Z', '2026-10-01T00:00:00Z', now)).toBe('No newsletter from them since Oct 15')
  })
  it('counts from when it was linked when none has come yet', () => {
    expect(quietError(null, '2026-11-10T00:00:00Z', now)).toBeNull()
    expect(quietError(null, '2026-10-10T00:00:00Z', now)).toBe('No newsletter from them since it was linked, Oct 10')
  })
})
