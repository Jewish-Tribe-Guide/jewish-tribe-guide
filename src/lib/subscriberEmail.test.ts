import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Subscriber } from './subscriberStore'

const mockSendEmail = vi.hoisted(() => vi.fn())
vi.mock('./email', () => ({ sendEmail: mockSendEmail, escapeHtml: (v: unknown) => String(v) }))

import { sendSubscribeConfirmation, sendNewListingNotification, sendClosureNotification } from './subscriberEmail'

function makeSubscriber(overrides: Partial<Subscriber> = {}): Subscriber {
  return {
    id: 'sub_1',
    communityId: 'philly',
    email: 'visitor@example.com',
    categories: null,
    notifyAdd: true,
    notifyClosure: true,
    unsubscribeToken: 'tok_1',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubEnv('RESEND_FROM', 'noreply@example.org') // not the sandbox address
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('sendSubscribeConfirmation', () => {
  it('sends to the subscriber with an unsubscribe/manage link', async () => {
    await sendSubscribeConfirmation(makeSubscriber())

    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    const call = mockSendEmail.mock.calls[0][0]
    expect(call.to).toBe('visitor@example.com')
    expect(call.subject).toBe("You're subscribed")
    expect(call.html).toContain('tok_1')
  })

  it('mentions both kinds when subscribed to adds and closures', async () => {
    await sendSubscribeConfirmation(makeSubscriber({ notifyAdd: true, notifyClosure: true }))

    const html = mockSendEmail.mock.calls[0][0].html
    expect(html).toContain('a new listing is added')
    expect(html).toContain('one closes')
  })

  it('mentions only the one kind actually subscribed to', async () => {
    await sendSubscribeConfirmation(makeSubscriber({ notifyAdd: true, notifyClosure: false }))

    const html = mockSendEmail.mock.calls[0][0].html
    expect(html).toContain('a new listing is added')
    expect(html).not.toContain('one closes')
  })

  it('says "every category" for a null (all-categories) subscription', async () => {
    await sendSubscribeConfirmation(makeSubscriber({ categories: null }))
    expect(mockSendEmail.mock.calls[0][0].html).toContain('every category')
  })

  it('counts specific categories, singular for exactly one', async () => {
    await sendSubscribeConfirmation(makeSubscriber({ categories: ['grocery'] }))
    expect(mockSendEmail.mock.calls[0][0].html).toContain('1 category you picked')
  })

  it('counts specific categories, plural for more than one', async () => {
    await sendSubscribeConfirmation(makeSubscriber({ categories: ['grocery', 'synagogue'] }))
    expect(mockSendEmail.mock.calls[0][0].html).toContain('2 categories you picked')
  })

  // Same sandbox guard every other sender here uses — see isSandbox's own
  // doc: RESEND_FROM defaults to Resend's sandbox address, which can only
  // deliver to the account owner, not the public, so sends are skipped
  // rather than failing loudly against every real subscriber.
  it('skips silently when RESEND_FROM is still the sandbox address', async () => {
    vi.stubEnv('RESEND_FROM', 'onboarding@resend.dev')
    await sendSubscribeConfirmation(makeSubscriber())
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})

// Not full coverage of these two — just confirming the sandbox guard this
// file's whole module shares still holds, alongside the new function above.
describe('sandbox guard shared by the other subscriber senders', () => {
  it('sendNewListingNotification skips when sandboxed', async () => {
    vi.stubEnv('RESEND_FROM', 'onboarding@resend.dev')
    await sendNewListingNotification([makeSubscriber()], { name: 'A Shul', url: 'https://example.com/a' }, 'Synagogues')
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('sendClosureNotification skips when sandboxed', async () => {
    vi.stubEnv('RESEND_FROM', 'onboarding@resend.dev')
    await sendClosureNotification([makeSubscriber()], { name: 'A Shul' }, 'Synagogues')
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})
