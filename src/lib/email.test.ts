import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Resend } from 'resend'
import type { ContactHospitalData, SubmissionRow } from '@/types'
import { adminAppUrl, escapeHtml, sendEmail, sendNotification, sendStatusChangeDigest, sendSubmissionNotification } from './email'

const minimalContact: ContactHospitalData = {
  fullName: '',
  phone: '',
  email: '',
  preferredContact: '',
  hospitalId: '',
  unitFloorRoom: '',
}

const mockGetCommunityNotifyRecipients = vi.hoisted(() => vi.fn())
vi.mock('./communityStore', () => ({ getCommunityNotifyRecipients: mockGetCommunityNotifyRecipients }))

// escapeHtml is the only thing standing between a submitter's free-typed name/
// notes and raw HTML in an admin's inbox — an XSS vector, not just cosmetics.

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml('<script>alert("x")</script> & "quoted"')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;quoted&quot;',
    )
  })

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Rivka Cohen')).toBe('Rivka Cohen')
  })

  it('escapes & before the other entities, so it never double-escapes them', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })

  it('coerces non-string values instead of throwing', () => {
    expect(escapeHtml(42)).toBe('42')
    expect(escapeHtml(true)).toBe('true')
    expect(escapeHtml(null)).toBe('null')
    expect(escapeHtml(undefined)).toBe('undefined')
  })
})

// A preview deployment's admin-notification link used to always point at
// APP_URL (the production domain), because a Vercel Preview build submits to
// a separate Supabase project — a reviewer clicking that link lands on
// production admin, which has no idea the submission exists. VERCEL_URL is
// Vercel's own per-deployment URL, correct for preview without any config.
describe('adminAppUrl', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('prefers VERCEL_URL over APP_URL when not running in production', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VERCEL_URL', 'my-app-git-branch-team.vercel.app')
    vi.stubEnv('APP_URL', 'https://production.example.org')
    expect(adminAppUrl()).toBe('https://my-app-git-branch-team.vercel.app')
  })

  it('prefers APP_URL over VERCEL_URL in production, for a custom domain', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('VERCEL_URL', 'my-app.vercel.app')
    vi.stubEnv('APP_URL', 'https://production.example.org')
    expect(adminAppUrl()).toBe('https://production.example.org')
  })

  it('falls back to APP_URL when VERCEL_URL is unset (local dev)', () => {
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('VERCEL_URL', '')
    vi.stubEnv('APP_URL', 'https://production.example.org')
    expect(adminAppUrl()).toBe('https://production.example.org')
  })

  it('returns a falsy value when neither is set, so the email link is omitted', () => {
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('VERCEL_URL', '')
    vi.stubEnv('APP_URL', '')
    expect(adminAppUrl()).toBeFalsy()
  })
})

vi.mock('resend', () => ({ Resend: vi.fn() }))

describe('sendEmail', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('throws without sending when RESEND_API_KEY is unset', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    await expect(sendEmail({ to: 'a@example.com', subject: 'Hi', html: '<p>hi</p>' })).rejects.toThrow(
      /RESEND_API_KEY/,
    )
    expect(Resend).not.toHaveBeenCalled()
  })

  describe('with an API key configured', () => {
    let sendSpy: ReturnType<typeof vi.fn>

    beforeEach(() => {
      vi.stubEnv('RESEND_API_KEY', 'key_123')
      // Stubbed to 'production' here so these tests exercise send mechanics
      // (from/replyTo/errors) independent of the [DEV] tagging behavior,
      // which has its own dedicated tests below.
      vi.stubEnv('NODE_ENV', 'production')
      sendSpy = vi.fn().mockResolvedValue({ data: { id: 'abc' }, error: null })
      vi.mocked(Resend).mockImplementation(
        function () { return { emails: { send: sendSpy } } } as unknown as typeof Resend,
      )
    })

    it('sends from the sandbox address when RESEND_FROM is unset', async () => {
      vi.stubEnv('RESEND_FROM', '')
      await sendEmail({ to: 'a@example.com', subject: 'Hi', html: '<p>hi</p>' })
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'onboarding@resend.dev', to: 'a@example.com', subject: 'Hi', html: '<p>hi</p>' }),
      )
    })

    it('sends from RESEND_FROM when set', async () => {
      vi.stubEnv('RESEND_FROM', 'noreply@ourdomain.org')
      await sendEmail({ to: 'a@example.com', subject: 'Hi', html: '<p>hi</p>' })
      expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ from: 'noreply@ourdomain.org' }))
    })

    it('omits replyTo entirely when not given, rather than sending it undefined', async () => {
      await sendEmail({ to: 'a@example.com', subject: 'Hi', html: '<p>hi</p>' })
      const call = sendSpy.mock.calls[0]![0]
      expect('replyTo' in call).toBe(false)
    })

    it('includes replyTo when given', async () => {
      await sendEmail({ to: 'a@example.com', subject: 'Hi', html: '<p>hi</p>', replyTo: 'reply@example.com' })
      expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ replyTo: 'reply@example.com' }))
    })

    it('accepts an array of recipients, for a community with several notify addresses', async () => {
      await sendEmail({ to: ['a@example.com', 'b@example.com'], subject: 'Hi', html: '<p>hi</p>' })
      expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ to: ['a@example.com', 'b@example.com'] }))
    })

    it('throws when Resend reports an error', async () => {
      sendSpy.mockResolvedValue({ data: null, error: { message: 'invalid domain' } })
      await expect(sendEmail({ to: 'a@example.com', subject: 'Hi', html: '<p>hi</p>' })).rejects.toThrow(
        /Resend email failed/,
      )
    })

    // Both submission-notification paths (a form response, a resource
    // suggestion) route to whichever community the submission belongs to —
    // not a single site-wide inbox. Added after a real bug: every
    // community's submissions used to email the same fixed NOTIFICATION_TO
    // address regardless of which community they were for.
    describe('per-community notification routing', () => {
      afterEach(() => mockGetCommunityNotifyRecipients.mockReset())

      it('sendNotification emails the submitting community\'s configured notify list', async () => {
        mockGetCommunityNotifyRecipients.mockResolvedValue(['ues-admin@example.com'])
        await sendNotification(
          { requestType: 'Feedback', contact: minimalContact, formData: { message: 'hi' } },
          'REQ-1',
          '2026-01-01',
          'ues',
        )
        expect(mockGetCommunityNotifyRecipients).toHaveBeenCalledWith('ues')
        expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ to: ['ues-admin@example.com'] }))
      })

      it('sendNotification falls back to NOTIFICATION_TO when the community has no notify list configured', async () => {
        mockGetCommunityNotifyRecipients.mockResolvedValue([])
        vi.stubEnv('NOTIFICATION_TO', 'fallback@example.com')
        await sendNotification(
          { requestType: 'Feedback', contact: minimalContact, formData: { message: 'hi' } },
          'REQ-1',
          '2026-01-01',
          'ues',
        )
        expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ to: ['fallback@example.com'] }))
      })

      // Same bug as sendSubmissionNotification's own admin link above, in two
      // more spots that build the "Open in admin" button: Feedback and a
      // custom form response both used to link to the bare /admin/responses
      // (no community segment) for every community.
      it('sendNotification links Feedback to the submitting community\'s own Responses tab', async () => {
        mockGetCommunityNotifyRecipients.mockResolvedValue(['ues-admin@example.com'])
        vi.stubEnv('VERCEL_ENV', 'production')
        vi.stubEnv('APP_URL', 'https://example.org')
        await sendNotification(
          { requestType: 'Feedback', contact: minimalContact, formData: { message: 'hi' } },
          'REQ-1',
          '2026-01-01',
          'ues',
        )
        const html = sendSpy.mock.calls[0]![0].html as string
        expect(html).toContain('href="https://example.org/ues/admin/responses"')
      })

      it('sendNotification links a custom form response to the submitting community\'s own Responses tab', async () => {
        mockGetCommunityNotifyRecipients.mockResolvedValue(['ues-admin@example.com'])
        vi.stubEnv('VERCEL_ENV', 'production')
        vi.stubEnv('APP_URL', 'https://example.org')
        await sendNotification(
          { requestType: 'Custom Form', formId: 'form-1', contact: minimalContact, formData: { message: 'hi' } },
          'REQ-1',
          '2026-01-01',
          'ues',
        )
        const html = sendSpy.mock.calls[0]![0].html as string
        expect(html).toContain('href="https://example.org/ues/admin/responses"')
      })

      it('sendSubmissionNotification reads the notify list off the submission\'s own community_id', async () => {
        mockGetCommunityNotifyRecipients.mockResolvedValue(['ues-admin@example.com'])
        const submission: SubmissionRow = {
          id: 's1',
          community_id: 'ues',
          operation: 'create',
          target_type: 'category',
          target_id: null,
          payload: { label: 'New Category', firstListing: { name: 'A Shul', anchorId: '', distance: null, address: '', phone: '' } },
          note: null,
          status: 'pending',
          submitted_by: null,
          created_at: '2026-01-01T00:00:00Z',
          reviewed_at: null,
          reviewed_by: null,
        }
        await sendSubmissionNotification(submission)
        expect(mockGetCommunityNotifyRecipients).toHaveBeenCalledWith('ues')
        expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ to: ['ues-admin@example.com'] }))
      })

      // Real bug: the "Review in admin" button linked to the bare /admin
      // superadmin console — which has no moderation queue of its own — for
      // every community, instead of that submission's own /{community}/admin.
      it("sendSubmissionNotification's admin link points at the submitting community's own console, not the bare superadmin one", async () => {
        mockGetCommunityNotifyRecipients.mockResolvedValue(['ues-admin@example.com'])
        vi.stubEnv('VERCEL_ENV', 'production')
        vi.stubEnv('APP_URL', 'https://example.org')
        const submission: SubmissionRow = {
          id: 's1',
          community_id: 'ues',
          operation: 'create',
          target_type: 'category',
          target_id: null,
          payload: { label: 'New Category', firstListing: { name: 'A Shul', anchorId: '', distance: null, address: '', phone: '' } },
          note: null,
          status: 'pending',
          submitted_by: null,
          created_at: '2026-01-01T00:00:00Z',
          reviewed_at: null,
          reviewed_by: null,
        }
        await sendSubmissionNotification(submission)
        const html = sendSpy.mock.calls[0]![0].html as string
        expect(html).toContain('href="https://example.org/ues/admin"')
        expect(html).not.toContain('href="https://example.org/admin"')
      })
    })

    // Real bug: every community's Google status changes used to email one
    // hardcoded address (NOTIFICATION_TO, or phillyjewishguide@gmail.com)
    // regardless of which community the listing belonged to, or which
    // admins had actually signed up for notifications — see
    // sendStatusChangeDigest's own comment.
    describe('sendStatusChangeDigest — per-community routing', () => {
      afterEach(() => mockGetCommunityNotifyRecipients.mockReset())

      it('routes each community\'s changes through its own configured notify list', async () => {
        mockGetCommunityNotifyRecipients.mockImplementation((slug: string) =>
          Promise.resolve(slug === 'philly' ? ['philly-admin@example.com'] : ['ues-admin@example.com']),
        )
        await sendStatusChangeDigest([
          { name: 'Kosher Bite', category: 'restaurant', from: 'OPERATIONAL', to: 'CLOSED_TEMPORARILY', communitySlug: 'philly' },
          { name: 'Bagel Shop', category: 'restaurant', from: 'OPERATIONAL', to: 'CLOSED_PERMANENTLY', communitySlug: 'ues' },
        ])

        expect(sendSpy).toHaveBeenCalledTimes(2)
        const calls = sendSpy.mock.calls.map((c) => c[0])
        expect(calls).toContainEqual(
          expect.objectContaining({ to: ['philly-admin@example.com'], subject: 'Kosher Bite is now temporarily closed' }),
        )
        expect(calls).toContainEqual(
          expect.objectContaining({ to: ['ues-admin@example.com'], subject: 'Bagel Shop is now permanently closed' }),
        )
      })

      it('never mixes one community\'s listings into another\'s digest email', async () => {
        mockGetCommunityNotifyRecipients.mockResolvedValue(['philly-admin@example.com'])
        await sendStatusChangeDigest([
          { name: 'Kosher Bite', category: 'restaurant', from: 'OPERATIONAL', to: 'CLOSED_TEMPORARILY', communitySlug: 'philly' },
          { name: 'Bagel Shop', category: 'restaurant', from: 'OPERATIONAL', to: 'CLOSED_PERMANENTLY', communitySlug: 'ues' },
        ])

        const phillyCall = sendSpy.mock.calls.find((c) => (c[0].html as string).includes('Kosher Bite'))!
        expect(phillyCall[0].html).not.toContain('Bagel Shop')
      })

      it('skips a community entirely when its notifications are off', async () => {
        mockGetCommunityNotifyRecipients.mockResolvedValue(null)
        await sendStatusChangeDigest([
          { name: 'Kosher Bite', category: 'restaurant', from: 'OPERATIONAL', to: 'CLOSED_TEMPORARILY', communitySlug: 'philly' },
        ])
        expect(sendSpy).not.toHaveBeenCalled()
      })

      it('falls back to NOTIFICATION_TO for a community with no notify list configured', async () => {
        mockGetCommunityNotifyRecipients.mockResolvedValue([])
        vi.stubEnv('NOTIFICATION_TO', 'fallback@example.com')
        await sendStatusChangeDigest([
          { name: 'Kosher Bite', category: 'restaurant', from: 'OPERATIONAL', to: 'CLOSED_TEMPORARILY', communitySlug: 'philly' },
        ])
        expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ to: ['fallback@example.com'] }))
      })
    })

    // A local dev run now points at the same disposable Supabase project the
    // write-test suites use, so a real Resend send can fire from ordinary
    // local clicking-around — this is what lets a real inbox filter those out.
    describe('[DEV] subject tagging', () => {
      it('sends the subject unprefixed in production', async () => {
        await sendEmail({ to: 'a@example.com', subject: 'New listing suggestion', html: '<p>hi</p>' })
        expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ subject: 'New listing suggestion' }))
      })

      it('prefixes the subject with [DEV] in any non-production environment', async () => {
        vi.stubEnv('NODE_ENV', 'development')
        await sendEmail({ to: 'a@example.com', subject: 'New listing suggestion', html: '<p>hi</p>' })
        expect(sendSpy).toHaveBeenCalledWith(
          expect.objectContaining({ subject: '[DEV] New listing suggestion' }),
        )
      })
    })
  })
})
