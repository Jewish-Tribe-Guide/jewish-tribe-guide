import { describe, expect, it } from 'vitest'
import { HONEYPOT_FIELD, isHoneypotTripped } from './honeypot'

// A false positive here silently drops a real person's request for help — the
// endpoint returns a fake success, so nobody finds out. That asymmetry is why
// the "real submissions are never treated as bots" cases below are the point of
// this file, more than the bot-catching ones.

describe('isHoneypotTripped', () => {
  it('catches a bot that filled the hidden field', () => {
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: 'Acme Corp' })).toBe(true)
  })

  it('lets a real submission through', () => {
    expect(isHoneypotTripped({ name: 'Rivka', phone: '215-555-0100' })).toBe(false)
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: '' })).toBe(false)
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: undefined })).toBe(false)
    expect(isHoneypotTripped({})).toBe(false)
  })

  it('ignores whitespace a browser autofill may leave behind', () => {
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: '   ' })).toBe(false)
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: '\n\t ' })).toBe(false)
  })

  it('does not throw on a body that is not an object', () => {
    for (const body of [null, undefined, 'string', 42, true, []]) {
      expect(() => isHoneypotTripped(body)).not.toThrow()
      expect(isHoneypotTripped(body)).toBe(false)
    }
  })

  // Only a filled *string* is a bot signal. A non-string value is a malformed
  // client, not evidence — and silently discarding it would hide the bug.
  it('does not treat a non-string value as tripped', () => {
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: 1 })).toBe(false)
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: true })).toBe(false)
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: ['a'] })).toBe(false)
  })

  it('watches a field name a form-filler would plausibly complete', () => {
    // The trap only works if bots recognize the name; a random string wouldn't
    // be filled in. Pinned so a rename has to be deliberate.
    expect(HONEYPOT_FIELD).toBe('company')
  })
})
