import { describe, expect, it } from 'vitest'
import { stableJson } from './stableJson'

describe('stableJson', () => {
  it('reads the same for the same thing whatever its keys’ order or unset keys', () => {
    expect(stableJson({ b: 1, a: { d: 2, c: undefined, e: null } })).toBe(stableJson({ a: { d: 2 }, b: 1 }))
  })
  it('keeps what differs, an array’s order included', () => {
    expect(stableJson({ a: false })).not.toBe(stableJson({}))
    expect(stableJson([1, 2])).not.toBe(stableJson([2, 1]))
  })
})
