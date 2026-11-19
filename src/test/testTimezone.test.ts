import { describe, expect, it } from 'vitest'

// vitest.config.ts runs the suite in UTC so a laptop sees what CI sees. A
// test that sets a time on the machine's clock where it means the
// community's then fails on the laptop too, not only in CI.
describe('the unit suite’s clock', () => {
  it('is UTC, whatever the machine is set to', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC')
    expect(new Date(2026, 5, 24, 12).getTimezoneOffset()).toBe(0)
  })
})
