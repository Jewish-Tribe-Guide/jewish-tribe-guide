import { describe, expect, it } from 'vitest'
import { previewCookieName, previewCookieOptions } from '../src/lib/previewCookie'
import { WRITE_SUITE_COMMUNITY, writeSuitePreviewCookie } from './writeSuiteCommunity.mjs'

// The write suites reach their hidden community's public pages with a cookie
// they make themselves. If it drifted from the one proxy.ts reads, every
// public request in cache-roundtrip would be a 404, which reads as the cache
// being broken rather than the cookie.
describe('the write community\'s preview cookie', () => {
  it('is the one proxy.ts reads, on the path it sets it for', () => {
    const cookie = writeSuitePreviewCookie('http://localhost:3211')
    expect(cookie.name).toBe(previewCookieName(WRITE_SUITE_COMMUNITY))
    expect(cookie.path).toBe(previewCookieOptions().path)
    expect(cookie.domain).toBe('localhost')
  })
})
