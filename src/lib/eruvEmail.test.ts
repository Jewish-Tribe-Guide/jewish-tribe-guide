import { describe, expect, it } from 'vitest'
import { emailStatusText, keptEmailSays, readEruvEmail, senderEmail } from './eruvEmail'

// An eruv's status email, read by the page reader's own sentences (the
// user, Oct 19): no AI, live at once, dated by when it was sent.

const TZ = 'America/New_York'
const FRIDAY = '2026-10-09T17:30:00.000Z'
const mail = (subject: string, text: string) => ({ messageId: 'm1', subject, text })

describe('emailStatusText', () => {
  it('reads the subject, and leaves out a quoted reply and the list footer', () => {
    const body = ['Have a good Shabbos.', '', 'On Fri, Oct 2, 2026 at 1:00 PM JCOR <alerts@groups.io> wrote:', '> The eruv is down this week.', '', '_._,_._,_', 'Groups.io Links: the eruv is down archive'].join('\n')
    expect(emailStatusText('Re: [JCOR-NE] The Eruv is UP', body)).toBe('The Eruv is UP. Have a good Shabbos.')
  })
})

describe('readEruvEmail', () => {
  it('up or down, from the subject or the words, dated the day it was sent', () => {
    expect(readEruvEmail(mail('[JCOR-NE] Eruv status', 'The Northeast Eruv is up for Shabbos.'), FRIDAY, TZ)).toEqual({
      kind: 'read',
      write: { ok: true, status: 'up', words: 'The Northeast Eruv is up', postedOn: '2026-10-09', at: FRIDAY },
    })
    expect(readEruvEmail(mail('Eruv is DOWN', 'Repairs are underway. Please do not carry.'), FRIDAY, TZ)).toMatchObject({ kind: 'read', write: { status: 'down' } })
  })

  it('never takes a date from its words: an email is about the week it came in', () => {
    const r = readEruvEmail(mail('Eruv', 'The eruv is up. Next inspection Oct 30, 2026.'), FRIDAY, TZ)
    expect(r).toMatchObject({ write: { postedOn: '2026-10-09' } })
  })

  it('the day where the community is: Thursday night in Philadelphia is Friday in UTC', () => {
    expect(readEruvEmail(mail('', 'The eruv is up'), '2026-10-09T02:00:00.000Z', TZ)).toMatchObject({ write: { postedOn: '2026-10-08' } })
  })

  it('both up and down: unclear, the status marked unreadable, the email kept', () => {
    const r = readEruvEmail(mail('Eruv update', 'The eruv is up except the north side. The eruv is down on Castor Ave.'), FRIDAY, TZ)
    expect(r.kind).toBe('unclear')
    if (r.kind !== 'unclear') return
    expect(r.write).toEqual({ ok: false, error: 'Unclear in their email “Eruv update”: “The eruv is up”', at: FRIDAY })
    expect(r.kept).toMatchObject({ messageId: 'm1', subject: 'Eruv update', sentAt: FRIDAY, words: 'The eruv is up' })
    expect(r.kept.text).toContain('Castor Ave')
  })

  it('neither: kept for an admin, nothing written', () => {
    const r = readEruvEmail(mail('Eruv dinner', 'Join us Sunday to thank our eruv volunteers.'), FRIDAY, TZ)
    expect(r).toEqual({ kind: 'no_status', kept: { messageId: 'm1', subject: 'Eruv dinner', sentAt: FRIDAY, text: 'Eruv dinner. Join us Sunday to thank our eruv volunteers.', words: null } })
  })
})

describe('keptEmailSays', () => {
  const kept = { messageId: 'm1', subject: 'Eruv update', sentAt: FRIDAY, text: '…', words: null }
  it('an admin’s up or down is dated by the email; neither writes nothing', () => {
    expect(keptEmailSays(kept, 'down', TZ)).toEqual({ ok: true, status: 'down', words: 'Read by an admin from their email “Eruv update”', postedOn: '2026-10-09', at: FRIDAY })
    expect(keptEmailSays(kept, 'neither', TZ)).toBeNull()
  })
})

describe('senderEmail', () => {
  it('an address, lower case; anything else is null', () => {
    expect(senderEmail(' JCOR-NE-Philadelphia@groups.io ')).toBe('jcor-ne-philadelphia@groups.io')
    expect(senderEmail('mailto:eruv@yiep.org')).toBe('eruv@yiep.org')
    // The address groups.io's page shows is its owner's: the list's own is
    // the one its emails come through (the user, Oct 19).
    expect(senderEmail('JCOR-NE-Philadelphia+owner@groups.io')).toBe('jcor-ne-philadelphia@groups.io')
    expect(senderEmail('JCOR-NE-Philadelphia+subscribe@groups.io')).toBe('jcor-ne-philadelphia@groups.io')
    expect(senderEmail('rabbi+eruv@gmail.com')).toBe('rabbi+eruv@gmail.com')
    expect(senderEmail('https://groups.io/g/JCOR-NE-Philadelphia')).toBeNull()
    expect(senderEmail('eruv at yiep')).toBeNull()
  })
})
