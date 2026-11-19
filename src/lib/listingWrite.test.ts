import { afterEach, describe, expect, it, vi } from 'vitest'
import { keptSourceUrl, pastedSource } from './listingWrite'

// What the four shul/item write routes share (Nov 18 review, item 44). The
// copies had drifted: one took a photo from either reader's folder, another
// from only one.
describe('keptSourceUrl', () => {
  afterEach(() => vi.unstubAllEnvs())
  const assets = 'https://abc.supabase.co/storage/v1/object/public/site-assets'

  it('takes a file either reader kept, in the guide’s own storage', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co')
    expect(keptSourceUrl(`${assets}/schedule-source/1790-x7.jpeg`)).toBe(`${assets}/schedule-source/1790-x7.jpeg`)
    expect(keptSourceUrl(`${assets}/message-source/1790-x7.pdf`)).toBe(`${assets}/message-source/1790-x7.pdf`)
  })

  it('takes nothing else', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co')
    for (const bad of [
      'https://evil.example/x.jpeg',
      `${assets}/schedule-source/../../other`,
      `${assets}/schedule-source/a/b.jpeg`,
      `${assets}/listing-photo/a.jpg`,
      `${assets}/schedule-source/`,
      42,
      null,
    ]) {
      expect(keptSourceUrl(bad)).toBeNull()
    }
  })
})

describe('pastedSource', () => {
  it('keeps what was pasted, trimmed and capped', () => {
    expect(pastedSource('  Mincha 6:35  ')).toBe('Mincha 6:35')
    expect(pastedSource('x'.repeat(5000))).toHaveLength(4000)
    expect(pastedSource(undefined)).toBe('')
  })
})
