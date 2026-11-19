import { describe, expect, it } from 'vitest'
import { imageTypeOf } from './imageBytes'

const b = (...xs: number[]) => new Uint8Array(xs)

describe('imageTypeOf', () => {
  it('reads each kind from its first bytes', () => {
    expect(imageTypeOf(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png')
    expect(imageTypeOf(b(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(imageTypeOf(new TextEncoder().encode('GIF89a'))).toBe('image/gif')
    expect(imageTypeOf(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp')
  })

  it('refuses anything else, whatever it is called', () => {
    expect(imageTypeOf(new TextEncoder().encode('<html><script>'))).toBeNull()
    expect(imageTypeOf(new TextEncoder().encode('RIFF\0\0\0\0WAVE'))).toBeNull()
    expect(imageTypeOf(b())).toBeNull()
  })
})
