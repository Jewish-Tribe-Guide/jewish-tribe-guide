import { describe, expect, it } from 'vitest'
import { LIMITS, oversizedField, payloadTooLarge, tooLong } from './limits'

describe('tooLong', () => {
  it('flags a string over the cap and allows one exactly at it', () => {
    expect(tooLong('a'.repeat(11), 10)).toBe(true)
    expect(tooLong('a'.repeat(10), 10)).toBe(false)
  })

  it('ignores non-strings, which have their own validators', () => {
    expect(tooLong(12345, 2)).toBe(false)
    expect(tooLong(null, 2)).toBe(false)
    expect(tooLong({ a: 'aaaa' }, 2)).toBe(false)
  })
})

describe('payloadTooLarge', () => {
  it('accepts an ordinary payload', () => {
    expect(payloadTooLarge({ name: 'Beth Israel', note: 'Great shul' })).toBeNull()
    expect(payloadTooLarge(null)).toBeNull()
  })

  it('rejects a payload past the byte budget', () => {
    const huge = { note: 'a'.repeat(LIMITS.payloadBytes + 1) }
    expect(payloadTooLarge(huge)).toMatch(/too large/i)
  })

  it('counts bytes rather than characters, so multi-byte text is measured honestly', () => {
    // Each of these is 3 bytes in UTF-8 but one JS character.
    const justOver = { note: 'א'.repeat(Math.ceil(LIMITS.payloadBytes / 2)) }
    expect(payloadTooLarge(justOver)).toMatch(/too large/i)
  })

  it('rejects a payload that cannot be serialized at all', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(payloadTooLarge(circular)).toMatch(/could not be processed/i)
  })
})

describe('oversizedField', () => {
  const big = 'a'.repeat(LIMITS.detailValue + 1)

  it('passes an ordinary details object', () => {
    expect(oversizedField({ hours: '9-5', note: 'call ahead' })).toBe(false)
    expect(oversizedField(null)).toBe(false)
    expect(oversizedField(undefined)).toBe(false)
  })

  it('flags an oversized top-level string', () => {
    expect(oversizedField({ note: big })).toBe(true)
  })

  it('flags an oversized string nested in an object', () => {
    expect(oversizedField({ hours: { mon: big } })).toBe(true)
  })

  it('flags an oversized string inside an array', () => {
    expect(oversizedField({ tags: ['kosher', big] })).toBe(true)
  })

  it('flags an oversized string inside an object inside an array', () => {
    // The shape minyanim actually take.
    expect(oversizedField({ minyanim: [{ tefillah: 'mincha', notes: big }] })).toBe(true)
  })

  it('does not flag long non-string values', () => {
    expect(oversizedField({ count: 10 ** 20, flag: true })).toBe(false)
  })
})
