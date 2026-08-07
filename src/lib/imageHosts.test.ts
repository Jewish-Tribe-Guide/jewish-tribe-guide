import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOptimizableImage, optimizedImagePatterns } from './imageHosts'

const SUPABASE = 'https://abcdefg.supabase.co'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('optimizedImagePatterns', () => {
  it('allows the project’s own storage bucket', () => {
    const patterns = optimizedImagePatterns(SUPABASE)
    expect(patterns).toContainEqual({
      protocol: 'https',
      hostname: 'abcdefg.supabase.co',
      pathname: '/storage/v1/object/public/**',
    })
  })

  it('always allows the stock-photo hosts the cards actually use', () => {
    const hosts = optimizedImagePatterns(SUPABASE).map((p) => p.hostname)
    expect(hosts).toContain('images.unsplash.com')
    expect(hosts).toContain('plus.unsplash.com')
  })

  it('survives a missing or malformed Supabase URL rather than failing the build', () => {
    expect(optimizedImagePatterns(undefined).length).toBeGreaterThan(0)
    expect(optimizedImagePatterns('not a url').length).toBeGreaterThan(0)
    expect(optimizedImagePatterns(undefined).map((p) => p.hostname)).not.toContain(
      'abcdefg.supabase.co',
    )
  })

  it('never returns a wildcard host, which would make the optimizer an open proxy', () => {
    const hosts = optimizedImagePatterns(SUPABASE).map((p) => p.hostname)
    expect(hosts).not.toContain('**')
    expect(hosts).not.toContain('*')
  })
})

describe('isOptimizableImage', () => {
  it('accepts a public object in the project’s storage bucket', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
    expect(
      isOptimizableImage('https://abcdefg.supabase.co/storage/v1/object/public/logos/logo.png'),
    ).toBe(true)
  })

  it('rejects a different path on the same Supabase host', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
    expect(isOptimizableImage('https://abcdefg.supabase.co/rest/v1/resource')).toBe(false)
  })

  it('rejects a different Supabase project', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
    expect(
      isOptimizableImage('https://someoneelse.supabase.co/storage/v1/object/public/x.png'),
    ).toBe(false)
  })

  it('accepts the Unsplash hosts, query string and all', () => {
    expect(
      isOptimizableImage('https://plus.unsplash.com/premium_photo-123?w=900&auto=format&q=60'),
    ).toBe(true)
    expect(isOptimizableImage('https://images.unsplash.com/photo-456?w=400')).toBe(true)
  })

  // This is the case that actually broke the home screen: next/image throws on
  // an unconfigured host, so anything unrecognized has to be caught here and
  // rendered unoptimized instead.
  it('rejects an arbitrary pasted host', () => {
    expect(isOptimizableImage('https://example.com/photo.jpg')).toBe(false)
    expect(isOptimizableImage('https://i.imgur.com/abc.png')).toBe(false)
  })

  it('rejects non-https and non-URL values', () => {
    expect(isOptimizableImage('http://images.unsplash.com/photo-456')).toBe(false)
    expect(isOptimizableImage('/local/relative.png')).toBe(false)
    expect(isOptimizableImage('')).toBe(false)
    expect(isOptimizableImage('javascript:alert(1)')).toBe(false)
  })

  it('is not fooled by a lookalike hostname', () => {
    expect(isOptimizableImage('https://images.unsplash.com.evil.test/photo')).toBe(false)
    expect(isOptimizableImage('https://evil-images.unsplash.com/photo')).toBe(false)
  })
})
