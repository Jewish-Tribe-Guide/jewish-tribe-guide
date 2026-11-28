import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Resend } from 'resend'
import { latestReceivedFrom, receivedAt } from './receivedEmail'

// Read now's "its latest email" from what the site's own address received
// (tracker 100), where the Gmail script answered before.

const NOW = Date.parse('2026-11-28T12:00:00Z')
const item = (id: string, from: string, created: string, to = ['philly@guide.example']) => ({ id, from, to, cc: null, received_for: [], created_at: created, subject: id, bcc: null, reply_to: null, message_id: `<${id}>`, attachments: [] })
const full = (id: string, from: string, headers: Record<string, string> = {}) => ({ object: 'email', ...item(id, from, '2026-11-27 10:00:00.000000+00'), html: null, text: `words of ${id}`, headers })

function client(pages: ReturnType<typeof item>[][], fulls: Record<string, ReturnType<typeof full>> = {}) {
  const list = vi.fn(async (opts?: { after?: string }) => {
    const i = opts?.after ? pages.findIndex((p) => p.some((e) => e.id === opts.after)) + 1 : 0
    return { data: { object: 'list', has_more: i < pages.length - 1, data: pages[i] ?? [] }, error: null }
  })
  const get = vi.fn(async (id: string) => ({ data: fulls[id] ?? null, error: fulls[id] ? null : { name: 'not_found' } }))
  return { resend: { emails: { receiving: { list, get, attachments: { list: vi.fn() } } } } as unknown as Resend, list, get }
}

beforeEach(() => vi.stubEnv('INBOUND_EMAIL_DOMAIN', 'guide.example'))
afterEach(() => vi.unstubAllEnvs())

describe('latestReceivedFrom', () => {
  it('reads Resend’s times', () => {
    expect(receivedAt('2026-11-28 05:15:20.198049+00')).toBe(Date.parse('2026-11-28T05:15:20.198Z'))
  })

  it('the newest from that sender to this community, opened in full', async () => {
    const { resend } = client(
      [[item('e3', 'other@x.org', '2026-11-28 09:00:00+00', ['riverton@guide.example']), item('e2', 'Mekor <admin@mekor.org>', '2026-11-27 10:00:00+00'), item('e1', 'admin@mekor.org', '2026-11-26 10:00:00+00')]],
      { e2: full('e2', 'Mekor <admin@mekor.org>', { From: 'Mekor <admin@mekor.org>' }) },
    )
    expect(await latestReceivedFrom(resend, 'philly', 'Admin@Mekor.org', { now: NOW })).toMatchObject({ messageId: '<e2>', from: 'Mekor <admin@mekor.org>', text: 'words of e2' })
  })

  it('a list’s email, whoever posted it, by its List-Post', async () => {
    const { resend } = client([[item('e2', 'dana@gmail.com', '2026-11-27 10:00:00+00')]], { e2: full('e2', 'dana@gmail.com', { 'List-Post': '<mailto:jcor-ne-philadelphia@groups.io>' }) })
    expect(await latestReceivedFrom(resend, 'philly', 'jcor-ne-philadelphia@groups.io', { now: NOW })).toMatchObject({ messageId: '<e2>', list: 'jcor-ne-philadelphia@groups.io' })
  })

  it('looks back two weeks, page by page, and no further', async () => {
    const { resend, list } = client([[item('e3', 'a@x.org', '2026-11-27 10:00:00+00')], [item('e2', 'b@x.org', '2026-11-20 10:00:00+00')], [item('e1', 'admin@mekor.org', '2026-11-01 10:00:00+00')]], {
      e3: full('e3', 'a@x.org'),
      e2: full('e2', 'b@x.org'),
    })
    expect(await latestReceivedFrom(resend, 'philly', 'admin@mekor.org', { now: NOW })).toBeNull()
    expect(list).toHaveBeenCalledTimes(3)
  })

  it('says so when Resend doesn’t answer', async () => {
    const { resend, list } = client([])
    list.mockResolvedValueOnce({ data: null, error: { name: 'restricted_api_key' } } as never)
    expect(await latestReceivedFrom(resend, 'philly', 'admin@mekor.org', { now: NOW })).toBe('failed')
  })

  it('nothing without a receiving domain', async () => {
    vi.stubEnv('INBOUND_EMAIL_DOMAIN', '')
    const { resend, list } = client([[item('e1', 'admin@mekor.org', '2026-11-27 10:00:00+00')]])
    expect(await latestReceivedFrom(resend, 'philly', 'admin@mekor.org', { now: NOW })).toBeNull()
    expect(list).not.toHaveBeenCalled()
  })
})
