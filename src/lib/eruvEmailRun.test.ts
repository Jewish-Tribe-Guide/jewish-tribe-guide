import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminEruv } from './eruvStore'

// An email from an eruv's sender, received: its status saved at once, as a
// page read is, and nothing done twice.
const m = vi.hoisted(() => ({ listEmailedEruvim: vi.fn(), saveEmailRead: vi.fn(), reportServerError: vi.fn() }))
vi.mock('@/lib/eruvStore', () => ({ listEmailedEruvim: m.listEmailedEruvim, saveEmailRead: m.saveEmailRead }))
vi.mock('@/lib/serverError', () => ({ reportServerError: m.reportServerError }))

const { eruvSenders, receiveEruvEmail } = await import('./eruvEmailRun')

const TZ = 'America/New_York'
const NE = {
  id: 'northeast',
  name: 'Northeast Eruv',
  statusUrl: null,
  statusEmail: 'jcor-ne-philadelphia@groups.io',
  statusEmailKept: null,
  statusCheckedAt: '2026-10-02T17:00:00.000Z',
  statusErrorAt: null,
} as unknown as AdminEruv
const email = (over: Record<string, unknown> = {}) => ({
  messageId: 'g1',
  from: 'JCOR NE <JCOR-NE-Philadelphia@groups.io>',
  subject: '[JCOR-NE] The Eruv is UP',
  date: '2026-10-09T17:30:00.000Z',
  text: 'Good Shabbos.',
  attachment: null,
  // Gmail's check of who sent it, as it writes it for groups.io.
  auth: 'mx.google.com; dkim=pass header.i=@groups.io header.s=20240830; spf=pass smtp.mailfrom="bounce+1@groups.io"; dmarc=pass (p=NONE) header.from=groups.io',
  ...over,
})

beforeEach(() => {
  vi.resetAllMocks()
  m.listEmailedEruvim.mockResolvedValue([NE])
  m.saveEmailRead.mockResolvedValue(undefined)
})

describe('receiveEruvEmail', () => {
  it('saves an up or down at once, dated by the email, and clears any kept email', async () => {
    expect(await receiveEruvEmail('philly', email(), { timezone: TZ })).toEqual({ status: 'eruv', eruv: 'northeast', read: 'up' })
    expect(m.saveEmailRead).toHaveBeenCalledWith('philly', 'northeast', { ok: true, status: 'up', words: 'The Eruv is UP.', postedOn: '2026-10-09', at: '2026-10-09T17:30:00.000Z' }, null)
  })

  // groups.io sends each email from whoever posted it (the user, Oct 19):
  // the list it came through is the eruv's.
  it('takes an email that came through its list, whoever posted it', async () => {
    const posted = email({ from: 'Moshe Levi via groups.io <mlevi=gmail.com@groups.io>', list: 'jcor-ne-philadelphia@groups.io' })
    expect(await receiveEruvEmail('philly', posted, { timezone: TZ })).toEqual({ status: 'eruv', eruv: 'northeast', read: 'up' })
    expect(await receiveEruvEmail('philly', { ...posted, list: null }, { timezone: TZ })).toBeNull()
  })

  // Its From and List-Post are only words in the email (the health sweep,
  // Nov 20): an email written to look like the eruv's isn't read.
  it('an email Gmail didn’t find came from the eruv’s address isn’t read', async () => {
    const spoofed = email({ auth: 'mx.google.com; dkim=pass header.i=@spoofer.example; spf=pass smtp.mailfrom=x@spoofer.example; dmarc=fail header.from=groups.io' })
    expect(await receiveEruvEmail('philly', spoofed, { timezone: TZ })).toEqual({ status: 'eruv', eruv: 'northeast', read: 'unverified' })
    const listed = email({ from: 'Someone <someone@spoofer.example>', list: 'jcor-ne-philadelphia@groups.io', auth: 'mx.google.com; dkim=pass header.i=@spoofer.example; dmarc=pass header.from=spoofer.example' })
    expect(await receiveEruvEmail('philly', listed, { timezone: TZ })).toMatchObject({ read: 'unverified' })
    expect(m.saveEmailRead).not.toHaveBeenCalled()
    expect(m.reportServerError).toHaveBeenCalledTimes(2)
  })

  // A script copied before Nov 20 sends no header: read as before, and
  // Sentry asks for the script to be copied again.
  it('with no check from Gmail to go by, reads it as before and says so', async () => {
    expect(await receiveEruvEmail('philly', email({ auth: undefined }), { timezone: TZ })).toMatchObject({ read: 'up' })
    expect(m.reportServerError).toHaveBeenCalledWith(expect.stringContaining('copy it again'))
  })

  it('is not for it when the sender is no eruv’s: the newsletter reader takes it', async () => {
    expect(await receiveEruvEmail('philly', email({ from: 'Mekor <info@mekor.org>' }), { timezone: TZ })).toBeNull()
    expect(m.saveEmailRead).not.toHaveBeenCalled()
  })

  it('an email no newer than what it shows changes nothing', async () => {
    expect(await receiveEruvEmail('philly', email({ date: '2026-10-01T12:00:00.000Z' }), { timezone: TZ })).toMatchObject({ read: 'already' })
    m.listEmailedEruvim.mockResolvedValue([{ ...NE, statusEmailKept: { messageId: 'g1', subject: 'x', sentAt: '2026-10-09T17:30:00.000Z', text: '', words: null } }])
    expect(await receiveEruvEmail('philly', email(), { timezone: TZ })).toMatchObject({ read: 'already' })
    expect(m.saveEmailRead).not.toHaveBeenCalled()
  })

  it('unclear: the status marked unreadable and the email kept; neither: only kept', async () => {
    await receiveEruvEmail('philly', email({ subject: 'Update', text: 'The eruv is up. The eruv is down on Castor.' }), { timezone: TZ })
    expect(m.saveEmailRead.mock.calls[0][2]).toMatchObject({ ok: false })
    expect(m.saveEmailRead.mock.calls[0][3]).toMatchObject({ messageId: 'g1', subject: 'Update' })
    await receiveEruvEmail('philly', email({ subject: 'Eruv dinner', text: 'Thank our volunteers.' }), { timezone: TZ })
    expect(m.saveEmailRead.mock.calls[1][2]).toBeNull()
    expect(m.saveEmailRead.mock.calls[1][3]).toMatchObject({ subject: 'Eruv dinner' })
  })

  it('lists the senders for the Gmail script', async () => {
    expect(await eruvSenders('philly')).toEqual(['jcor-ne-philadelphia@groups.io'])
  })
})
