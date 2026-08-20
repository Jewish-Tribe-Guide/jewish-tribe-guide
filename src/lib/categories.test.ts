import { describe, expect, it } from 'vitest'
import { isCategorySyncEligible, resolveCapabilities } from './categories'

describe('resolveCapabilities', () => {
  it('fills in defaults for missing keys', () => {
    expect(resolveCapabilities({ add: false })).toEqual({
      add: false,
      edit: true,
      report: true,
      directorySearch: true,
      map: true,
    })
  })

  it('forces map off when hasAddress is exactly false, even if the stored value says true', () => {
    expect(resolveCapabilities({ map: true }, false).map).toBe(false)
  })

  it('leaves map alone when hasAddress is true', () => {
    expect(resolveCapabilities({ map: true }, true).map).toBe(true)
  })

  it('leaves map alone when hasAddress is unknown (undefined) — an unset column defaults to true elsewhere', () => {
    expect(resolveCapabilities({ map: true }).map).toBe(true)
  })
})

describe('isCategorySyncEligible', () => {
  it('is eligible when hasAddress is true', () => {
    expect(isCategorySyncEligible({ hasAddress: true })).toBe(true)
  })

  it('is eligible when hasAddress is unset — an unset column defaults to true elsewhere', () => {
    expect(isCategorySyncEligible({})).toBe(true)
  })

  it('is never eligible when hasAddress is false — no address means nothing for Google to match', () => {
    expect(isCategorySyncEligible({ hasAddress: false })).toBe(false)
  })
})
