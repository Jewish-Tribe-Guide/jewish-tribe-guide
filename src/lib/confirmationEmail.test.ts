import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubmissionPayload } from './requests'
import type { SubmissionRow } from '@/types'

const mockGetCommunityAdminEmails = vi.hoisted(() => vi.fn())
const mockGetCommunityNotifyRecipients = vi.hoisted(() => vi.fn())
vi.mock('./communityStore', () => ({
  getCommunityAdminEmails: mockGetCommunityAdminEmails,
  getCommunityNotifyRecipients: mockGetCommunityNotifyRecipients,
}))

const mockSendEmail = vi.hoisted(() => vi.fn())
vi.mock('./email', () => ({ sendEmail: mockSendEmail, escapeHtml: (v: unknown) => String(v) }))

// Real gap: reply-to and the admin-copy list used to come from one
// site-wide env var (RESEND_REPLY_TO/NOTIFICATION_TO) regardless of which
// community a submission was for — every confirmation email read back to
// Philly's own address even for a community with its own admin_emails
// configured. These three functions are the only senders that go straight
// to the public (an intake form, a directory submission, and its approve/
// reject decision), so they're the ones that need to route per-community.
import { sendRequestConfirmation, sendDecisionEmail, sendSubmissionConfirmation } from './confirmationEmail'

const minimalContact: SubmissionPayload['contact'] = {
  fullName: 'Jane Doe',
  phone: '',
  email: 'visitor@example.com',
  preferredContact: '',
  hospitalId: '',
  unitFloorRoom: '',
}

function makeSubmission(overrides: Partial<SubmissionRow> = {}): SubmissionRow {
  return {
    id: 's1',
    community_id: 'baltimore',
    operation: 'create',
    target_type: 'listing',
    target_id: null,
    payload: { name: 'Kosher Deli', category: 'grocery', address: '', phone: '', details: {} },
    note: null,
    status: 'pending',
    submitted_by: { name: 'Jane Doe', email: 'visitor@example.com' },
    created_at: '2026-01-01T00:00:00Z',
    reviewed_at: null,
    reviewed_by: null,
    case_number: 1,
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubEnv('RESEND_FROM', 'noreply@example.org') // not the sandbox address
  mockGetCommunityAdminEmails.mockResolvedValue(['baltimorejewishguide@gmail.com', 'second-admin@example.com'])
  mockGetCommunityNotifyRecipients.mockResolvedValue(['baltimorejewishguide@gmail.com', 'second-admin@example.com'])
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('per-community reply-to and bcc on public-facing confirmation emails', () => {
  it('sendSubmissionConfirmation replies to the submitting community\'s own first admin email, and bccs the rest', async () => {
    await sendSubmissionConfirmation(makeSubmission({ community_id: 'baltimore' }))

    expect(mockGetCommunityAdminEmails).toHaveBeenCalledWith('baltimore')
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        replyTo: 'baltimorejewishguide@gmail.com',
        bcc: ['baltimorejewishguide@gmail.com', 'second-admin@example.com'],
      }),
    )
  })

  it('sendDecisionEmail replies to the submitting community\'s own admin email', async () => {
    await sendDecisionEmail(makeSubmission({ community_id: 'baltimore' }), 'approved')

    expect(mockGetCommunityAdminEmails).toHaveBeenCalledWith('baltimore')
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: 'baltimorejewishguide@gmail.com' }))
  })

  it('sendRequestConfirmation replies to the submitting community\'s own admin email', async () => {
    await sendRequestConfirmation(
      { requestType: 'Feedback', contact: minimalContact, formData: { message: 'hi' } },
      'REQ-1',
      'baltimore',
    )

    expect(mockGetCommunityAdminEmails).toHaveBeenCalledWith('baltimore')
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: 'baltimorejewishguide@gmail.com' }))
  })

  it('falls back to the site-wide NOTIFICATION_TO when the community has no admin_emails configured', async () => {
    mockGetCommunityAdminEmails.mockResolvedValue([])
    mockGetCommunityNotifyRecipients.mockResolvedValue([])
    vi.stubEnv('NOTIFICATION_TO', 'fallback@example.com')

    await sendSubmissionConfirmation(makeSubmission({ community_id: 'no-admins-yet' }))

    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: 'fallback@example.com', bcc: [] }))
  })

  it('a different community gets its own address, not the last one requested', async () => {
    mockGetCommunityAdminEmails.mockImplementation(async (slug: string) =>
      slug === 'philly' ? ['phillyjewishguide@gmail.com'] : ['baltimorejewishguide@gmail.com'],
    )

    await sendSubmissionConfirmation(makeSubmission({ community_id: 'philly' }))
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: 'phillyjewishguide@gmail.com' }))

    await sendSubmissionConfirmation(makeSubmission({ community_id: 'baltimore' }))
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: 'baltimorejewishguide@gmail.com' }))
  })
})

// These three are the only emails that go straight to a member of the public,
// and until now the suite only checked where their replies route. What they
// actually SAY was untested — the same gap that let "#undefined" ship in the
// admin-facing notifications and sit there unnoticed.
describe('what the public-facing emails actually say', () => {
  function bodyOf(): { subject: string; html: string } {
    return mockSendEmail.mock.calls.at(-1)![0] as { subject: string; html: string }
  }

  it('the submission confirmation names the listing the person submitted', async () => {
    await sendSubmissionConfirmation(makeSubmission())
    const { subject, html } = bodyOf()
    expect(`${subject} ${html}`).toContain('Kosher Deli')
    // Sets the expectation that a human looks at it — the one thing a
    // submitter wants to know is whether this is done or pending.
    expect(html).toMatch(/review/i)
  })

  it('an approval says it is approved and live, and names the listing', async () => {
    await sendDecisionEmail(makeSubmission(), 'approved')
    const { subject, html } = bodyOf()
    expect(subject).toMatch(/approved/i)
    expect(subject).toContain('Kosher Deli')
    // The body says what happened in plain words rather than repeating the
    // status ("has been added to the directory"), which is the better copy —
    // so assert the meaning, not the word.
    expect(html).toMatch(/added to the directory/i)
    expect(html).not.toMatch(/weren&apos;t able|not able|unable/i)
  })

  it('a rejection is not dressed up as an approval, and carries the reason given', async () => {
    await sendDecisionEmail(makeSubmission(), 'rejected', 'Duplicate of an existing listing')
    const { subject, html } = bodyOf()
    expect(subject).not.toMatch(/approved/i)
    // The reason is the entire value of a rejection email to the person who
    // submitted; without it they only learn "no".
    expect(html).toContain('Duplicate of an existing listing')
  })

  it('a category suggestion is named by its own label, not as a listing', async () => {
    await sendDecisionEmail(
      makeSubmission({ target_type: 'category', payload: { label: 'Kosher Butchers' } as never }),
      'approved',
    )
    const { subject, html } = bodyOf()
    expect(`${subject} ${html}`).toContain('Kosher Butchers')
  })

  it('sends nothing at all when the submitter left no email address', async () => {
    await sendSubmissionConfirmation(makeSubmission({ submitted_by: null }))
    await sendDecisionEmail(makeSubmission({ submitted_by: null }), 'approved')
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('sends nothing while RESEND_FROM is still the sandbox sender', async () => {
    // The guard that stops a half-configured deployment mailing the public
    // from an address that cannot receive their reply.
    vi.stubEnv('RESEND_FROM', '')
    await sendSubmissionConfirmation(makeSubmission())
    await sendDecisionEmail(makeSubmission(), 'approved')
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})
