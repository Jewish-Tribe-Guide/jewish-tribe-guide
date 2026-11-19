import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ compared: 0 }))
vi.mock('node:crypto', async (orig) => {
  const real = await orig<typeof import('node:crypto')>()
  return {
    ...real,
    timingSafeEqual: (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => {
      m.compared++
      return real.timingSafeEqual(a, b)
    },
  }
})

const { cronAuthorized } = await import('./cronAuth')

const req = (headers: Record<string, string>) => ({ headers: new Headers(headers) }) as unknown as NextRequest

afterEach(() => {
  vi.unstubAllEnvs()
  m.compared = 0
})

describe('cronAuthorized', () => {
  it('takes the secret as a bearer token or x-cron-secret, and nothing else', () => {
    vi.stubEnv('CRON_SECRET', 's3cret-value')
    expect(cronAuthorized(req({ authorization: 'Bearer s3cret-value' }))).toBe(true)
    expect(cronAuthorized(req({ 'x-cron-secret': 's3cret-value' }))).toBe(true)
    expect(cronAuthorized(req({ authorization: 'Bearer s3cret-valuX' }))).toBe(false)
    expect(cronAuthorized(req({ authorization: 'Bearer s3' }))).toBe(false)
    expect(cronAuthorized(req({ 'x-cron-secret': '' }))).toBe(false)
    expect(cronAuthorized(req({}))).toBe(false)
  })

  // Nov 18 review: `===` returns as soon as a character differs, so how long
  // a wrong guess takes says how much of it was right. A unit test can't
  // time that reliably; it checks the comparison is the constant-time one.
  it('compares with timingSafeEqual, not ===', () => {
    vi.stubEnv('CRON_SECRET', 's3cret-value')
    cronAuthorized(req({ authorization: 'Bearer wrong' }))
    expect(m.compared).toBeGreaterThan(0)
  })

  it('with no secret set, is open in dev and closed in production', () => {
    vi.stubEnv('CRON_SECRET', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(cronAuthorized(req({}))).toBe(false)
    vi.stubEnv('NODE_ENV', 'development')
    expect(cronAuthorized(req({}))).toBe(true)
  })
})
