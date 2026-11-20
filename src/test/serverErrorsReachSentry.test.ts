import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A caught error in a route used to reach only the function's log
// (Nov 20, the health sweep). Routes say it through reportServerError
// (src/lib/serverError.ts), which logs it and sends it to Sentry.

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  scope: { setFingerprint: vi.fn(), setTag: vi.fn(), setExtra: vi.fn() },
}))
vi.mock('@sentry/nextjs', () => ({
  captureException: sentry.captureException,
  captureMessage: sentry.captureMessage,
  withScope: (fn: (s: typeof sentry.scope) => void) => fn(sentry.scope),
}))
const { reportServerError } = await import('@/lib/serverError')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('caught errors in routes reach Sentry', () => {
  it('no route logs an error only to its own log', () => {
    const offenders = files('src/app/api').flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, i) => (/console\.error\(/.test(line) ? [`${path}:${i + 1}`] : [])),
    )
    expect(offenders).toEqual([])
  })
})

describe('reportServerError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('logs as before, and sends the error grouped by the place it came from', () => {
    const err = new Error('insert failed: 23505')
    reportServerError('[submissions] insert failed:', err)
    expect(console.error).toHaveBeenCalledWith('[submissions] insert failed:', err)
    expect(sentry.captureException).toHaveBeenCalledWith(err)
    expect(sentry.scope.setFingerprint).toHaveBeenCalledWith(['[submissions] insert failed:'])
    expect(sentry.scope.setTag).toHaveBeenCalledWith('where', 'submissions')
  })

  it('sends what was caught as words when it isn’t an Error (a database error object)', () => {
    reportServerError('[confirm] rpc failed:', { message: 'boom', code: '57014' })
    expect(sentry.captureException).not.toHaveBeenCalled()
    expect(sentry.captureMessage).toHaveBeenCalledWith('[confirm] rpc failed: {"message":"boom","code":"57014"}', 'error')
  })

  it('never throws, even when Sentry does', () => {
    sentry.captureException.mockImplementation(() => {
      throw new Error('sdk down')
    })
    expect(() => reportServerError('[x] failed:', new Error('y'))).not.toThrow()
  })
})
