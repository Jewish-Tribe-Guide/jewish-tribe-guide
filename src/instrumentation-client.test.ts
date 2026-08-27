import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sentryInitMock = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  init: sentryInitMock,
  captureRouterTransitionStart: vi.fn(),
}))

const posthogInitMock = vi.fn()
vi.mock('posthog-js', () => ({ default: { init: posthogInitMock } }))

// Same regression class as instrumentation.test.ts (the server-side gate) —
// this is the client-side half, previously untested. Both Sentry and PostHog
// only report from the real Vercel production deployment; NEXT_PUBLIC_SENTRY_DSN
// and the PostHog vars all live in .env.local for local dev convenience, so
// without this gate every `npm run dev` session and local production-mode
// run (`npm run build && npm run start`, the e2e suites) would report real
// browser events into the same projects as actual production traffic.
describe('instrumentation-client — only reports from the real Vercel production deployment', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    vi.resetModules()
    sentryInitMock.mockClear()
    posthogInitMock.mockClear()
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('initializes neither SDK outside VERCEL_ENV=production (e.g. local dev)', async () => {
    delete process.env.NEXT_PUBLIC_VERCEL_ENV
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test'
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://us.posthog.com'
    await import('./instrumentation-client')

    expect(sentryInitMock).not.toHaveBeenCalled()
    expect(posthogInitMock).not.toHaveBeenCalled()
  })

  it('initializes neither SDK on a Vercel preview deployment', async () => {
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'preview'
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test'
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://us.posthog.com'
    await import('./instrumentation-client')

    expect(sentryInitMock).not.toHaveBeenCalled()
    expect(posthogInitMock).not.toHaveBeenCalled()
  })

  it('initializes Sentry on production even when PostHog is unconfigured', async () => {
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'production'
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST
    await import('./instrumentation-client')

    expect(sentryInitMock).toHaveBeenCalledTimes(1)
    expect(posthogInitMock).not.toHaveBeenCalled()
  })

  it('initializes PostHog with the configured token/host on production', async () => {
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'production'
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test'
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://us.posthog.com'
    await import('./instrumentation-client')

    expect(posthogInitMock).toHaveBeenCalledTimes(1)
    expect(posthogInitMock).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({ api_host: 'https://us.posthog.com' }),
    )
  })
})
