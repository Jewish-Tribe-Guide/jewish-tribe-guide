import { describe, expect, it } from 'vitest'
import robots from './robots'

/** Whether a robots.txt rule matches a path, as Google reads one: a prefix,
 *  with `*` for any run of characters. */
const matches = (rule: string, path: string) => new RegExp('^' + rule.split('*').map((p) => p.replace(/[.?+^$()[\]{}|\\]/g, '\\$&')).join('.*')).test(path)

describe('robots.txt', () => {
  const { disallow } = robots().rules as { disallow: string[] }
  const blocked = (path: string) => disallow.some((rule) => matches(rule, path))

  // Until Nov 20 only Philly's admin and inbox were listed.
  it('keeps every community’s admin and inbox out, not only Philly’s', () => {
    for (const path of ['/philly/admin', '/ues/admin/places', '/baltimore/inbox', '/admin', '/inbox', '/api/categories']) {
      expect(blocked(path), path).toBe(true)
    }
  })

  it('lets the public pages in', () => {
    for (const path of ['/', '/philly', '/ues/synagogue', '/philly/restaurant/abc', '/philly/about']) {
      expect(blocked(path), path).toBe(false)
    }
  })
})
