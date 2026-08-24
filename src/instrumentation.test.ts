import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const initMock = vi.fn()
vi.mock('@sentry/nextjs', () => ({ init: initMock, captureRequestError: vi.fn() }))

// Regression coverage for a real incident: SENTRY_DSN/SENTRY_API access lives
// in .env.local for local dev convenience, so without the VERCEL_ENV gate,
// every `npm run dev` session and every local production-mode run (`npm run
// build && npm run start`, the e2e suites) reported real events into the
// same Sentry project as actual production traffic — see instrumentation.ts's
// own comment. All 8 of the project's "unresolved" issues turned out to be
// exactly this, none from real visitors.
describe('instrumentation register — only reports from the real Vercel production deployment', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    vi.resetModules()
    initMock.mockClear()
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('does not initialize Sentry outside VERCEL_ENV=production (e.g. local dev, or a local production build)', async () => {
    delete process.env.VERCEL_ENV
    process.env.NEXT_RUNTIME = 'nodejs'
    const { register } = await import('./instrumentation')

    register()

    expect(initMock).not.toHaveBeenCalled()
  })

  it('does not initialize Sentry on a Vercel preview deployment', async () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.NEXT_RUNTIME = 'nodejs'
    const { register } = await import('./instrumentation')

    register()

    expect(initMock).not.toHaveBeenCalled()
  })

  it('initializes Sentry on the real Vercel production deployment', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.NEXT_RUNTIME = 'nodejs'
    const { register } = await import('./instrumentation')

    register()

    expect(initMock).toHaveBeenCalledTimes(1)
  })
})
