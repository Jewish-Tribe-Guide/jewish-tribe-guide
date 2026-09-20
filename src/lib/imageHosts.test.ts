import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOptimizableImage, optimizedImagePatterns, storageThumbnailUrl } from './imageHosts'

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

  // The emergency kill switch for Vercel's Image Optimization usage — every
  // call site already falls back to `unoptimized` for a host this returns
  // false for, so forcing false here (regardless of host) is the one place
  // that needs to know about the switch at all.
  it('rejects everything, even an otherwise-allowed host, once NEXT_PUBLIC_IMAGES_UNOPTIMIZED is set', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
    vi.stubEnv('NEXT_PUBLIC_IMAGES_UNOPTIMIZED', '1')
    expect(
      isOptimizableImage('https://abcdefg.supabase.co/storage/v1/object/public/logos/logo.png'),
    ).toBe(false)
    expect(isOptimizableImage('https://images.unsplash.com/photo-456?w=400')).toBe(false)
  })

  it('is unaffected by any other value of NEXT_PUBLIC_IMAGES_UNOPTIMIZED', () => {
    vi.stubEnv('NEXT_PUBLIC_IMAGES_UNOPTIMIZED', '0')
    expect(isOptimizableImage('https://images.unsplash.com/photo-456?w=400')).toBe(true)
  })

  // The targeted switch: Supabase Storage (admin/community-uploaded listing
  // photos — the actual volume driver) goes unoptimized, but Unsplash
  // category-tile photos, the much smaller and more visible set, don't.
  it('rejects only Supabase Storage once NEXT_PUBLIC_UPLOADED_IMAGES_UNOPTIMIZED is set, leaving Unsplash optimized', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
    vi.stubEnv('NEXT_PUBLIC_UPLOADED_IMAGES_UNOPTIMIZED', '1')
    expect(
      isOptimizableImage('https://abcdefg.supabase.co/storage/v1/object/public/logos/logo.png'),
    ).toBe(false)
    expect(isOptimizableImage('https://images.unsplash.com/photo-456?w=400')).toBe(true)
  })

  it('is unaffected by any other value of NEXT_PUBLIC_UPLOADED_IMAGES_UNOPTIMIZED', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
    vi.stubEnv('NEXT_PUBLIC_UPLOADED_IMAGES_UNOPTIMIZED', '0')
    expect(
      isOptimizableImage('https://abcdefg.supabase.co/storage/v1/object/public/logos/logo.png'),
    ).toBe(true)
  })

  it('the total kill switch still wins over the targeted one', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
    vi.stubEnv('NEXT_PUBLIC_IMAGES_UNOPTIMIZED', '1')
    vi.stubEnv('NEXT_PUBLIC_UPLOADED_IMAGES_UNOPTIMIZED', '0')
    expect(isOptimizableImage('https://images.unsplash.com/photo-456?w=400')).toBe(false)
  })
})

describe('storageThumbnailUrl', () => {
  const PHOTO = `${SUPABASE}/storage/v1/object/public/site-assets/listing-photo/1786438175519-2c5byb.jpeg`

  it('rewrites a public Storage object to the transform endpoint, cropped to a square at 2x the shown size', () => {
    const url = new URL(storageThumbnailUrl(PHOTO, 40)!)

    expect(url.origin).toBe(SUPABASE)
    expect(url.pathname).toBe('/storage/v1/render/image/public/site-assets/listing-photo/1786438175519-2c5byb.jpeg')
    expect(Object.fromEntries(url.searchParams)).toEqual({ width: '80', height: '80', resize: 'cover', quality: '70' })
  })

  it('replaces any query string the original carried, rather than appending to it', () => {
    const url = new URL(storageThumbnailUrl(`${PHOTO}?t=123&width=9999`, 36)!)
    expect(url.searchParams.get('t')).toBeNull()
    expect(url.searchParams.get('width')).toBe('72')
  })

  it('clamps absurd sizes', () => {
    expect(new URL(storageThumbnailUrl(PHOTO, 4000)!).searchParams.get('width')).toBe('512')
    expect(new URL(storageThumbnailUrl(PHOTO, 1)!).searchParams.get('width')).toBe('16')
  })

  it.each([
    ['another host (Unsplash)', 'https://images.unsplash.com/photo-1?w=400'],
    ['a hotlinked thumbnail host', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:abc'],
    ['a lookalike host', 'https://evilsupabase.co/storage/v1/object/public/a/b.jpg'],
    ['a non-public Storage path', `${SUPABASE}/storage/v1/object/authenticated/a/b.jpg`],
    ['a path outside Storage', `${SUPABASE}/rest/v1/resource`],
    ['plain http', 'http://abcdefg.supabase.co/storage/v1/object/public/a/b.jpg'],
    ['not a URL', 'not a url'],
    ['an empty string', ''],
  ])('leaves %s alone (returns null)', (_name, src) => {
    expect(storageThumbnailUrl(src, 40)).toBeNull()
  })

  it('is switched off by NEXT_PUBLIC_STORAGE_THUMBNAILS_DISABLED=1, and only by that exact value', () => {
    vi.stubEnv('NEXT_PUBLIC_STORAGE_THUMBNAILS_DISABLED', '1')
    expect(storageThumbnailUrl(PHOTO, 40)).toBeNull()

    vi.stubEnv('NEXT_PUBLIC_STORAGE_THUMBNAILS_DISABLED', '0')
    expect(storageThumbnailUrl(PHOTO, 40)).not.toBeNull()
  })
})
