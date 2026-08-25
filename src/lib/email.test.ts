import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Resend } from 'resend'
import { adminAppUrl, escapeHtml, sendEmail } from './email'

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

    it('throws when Resend reports an error', async () => {
      sendSpy.mockResolvedValue({ data: null, error: { message: 'invalid domain' } })
      await expect(sendEmail({ to: 'a@example.com', subject: 'Hi', html: '<p>hi</p>' })).rejects.toThrow(
        /Resend email failed/,
      )
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
