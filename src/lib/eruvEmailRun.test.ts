import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminEruv } from './eruvStore'

// An email from an eruv's sender, received: its status saved at once, as a
// page read is, and nothing done twice.
const m = vi.hoisted(() => ({ listEmailedEruvim: vi.fn(), saveEmailRead: vi.fn() }))
vi.mock('@/lib/eruvStore', () => ({ listEmailedEruvim: m.listEmailedEruvim, saveEmailRead: m.saveEmailRead }))

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
