import { describe, expect, it } from 'vitest'
import { formatPhone, isHttpUrl, isValidPhone, normalizeUrl, validateContact } from './validation'
import { LIMITS } from './limits'
import type { ContactHospitalData } from '@/types'

const contact = (over: Partial<ContactHospitalData> = {}): ContactHospitalData =>
  ({ fullName: 'Rivka Cohen', phone: '215-555-0100', email: '', ...over }) as ContactHospitalData

describe('isValidPhone', () => {
  it('accepts common US formats', () => {
    expect(isValidPhone('(215) 555-0100')).toBe(true)
    expect(isValidPhone('215-555-0100')).toBe(true)
    expect(isValidPhone('+1 215 555 0100')).toBe(true)
    expect(isValidPhone('2155550100')).toBe(true)
  })

  it('accepts a 7-digit local and a 15-digit international number', () => {
    expect(isValidPhone('555-0100')).toBe(true)
    expect(isValidPhone('+972 2 123 4567')).toBe(true)
  })

  it('rejects too few or too many digits', () => {
    expect(isValidPhone('12345')).toBe(false)
    expect(isValidPhone('1234567890123456')).toBe(false)
    expect(isValidPhone('')).toBe(false)
  })

  it('ignores punctuation entirely when counting digits', () => {
    expect(isValidPhone('---215---555---0100---')).toBe(true)
  })
})

describe('formatPhone', () => {
  it('masks progressively as digits are typed', () => {
    expect(formatPhone('')).toBe('')
    expect(formatPhone('21')).toBe('(21')
    expect(formatPhone('215')).toBe('(215')
    expect(formatPhone('2155')).toBe('(215) 5')
    expect(formatPhone('215555')).toBe('(215) 555')
    expect(formatPhone('2155550100')).toBe('(215) 555-0100')
  })

  it('is idempotent on an already-formatted number', () => {
    expect(formatPhone('(215) 555-0100')).toBe('(215) 555-0100')
    expect(formatPhone(formatPhone('2155550100'))).toBe('(215) 555-0100')
  })

  it('strips a leading US country code', () => {
    expect(formatPhone('12155550100')).toBe('(215) 555-0100')
    expect(formatPhone('+1 (215) 555-0100')).toBe('(215) 555-0100')
  })

  it('leaves a non-US or extension-bearing number untouched rather than mangling it', () => {
    expect(formatPhone('+972 2 123 4567 x99')).toBe('+972 2 123 4567 x99')
    expect(formatPhone('22155550100')).toBe('22155550100')
  })
})

describe('normalizeUrl', () => {
  it('adds https to a bare domain', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com')
    expect(normalizeUrl('www.example.com/menu')).toBe('https://www.example.com/menu')
  })

  it('leaves an existing http(s) URL alone and is idempotent', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com')
    expect(normalizeUrl('http://example.com')).toBe('http://example.com')
    expect(normalizeUrl(normalizeUrl('example.com'))).toBe('https://example.com')
  })

  it('leaves other deliberate schemes untouched so isHttpUrl can reject them clearly', () => {
    expect(normalizeUrl('mailto:rav@example.com')).toBe('mailto:rav@example.com')
    expect(normalizeUrl('tel:+12155550100')).toBe('tel:+12155550100')
    expect(normalizeUrl('ftp://files.example.com')).toBe('ftp://files.example.com')
  })

  it('trims whitespace and passes an empty value through', () => {
    expect(normalizeUrl('  example.com  ')).toBe('https://example.com')
    expect(normalizeUrl('   ')).toBe('')
  })
})

describe('isHttpUrl', () => {
  it('accepts http and https', () => {
    expect(isHttpUrl('https://example.com')).toBe(true)
    expect(isHttpUrl('http://example.com/path?q=1')).toBe(true)
    expect(isHttpUrl('  https://example.com  ')).toBe(true)
  })

  // These render as clickable buttons on approved listings, so a non-http
  // scheme getting through would be an injection vector.
  it('rejects dangerous and non-http schemes', () => {
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isHttpUrl('vbscript:msgbox(1)')).toBe(false)
    expect(isHttpUrl('file:///etc/passwd')).toBe(false)
    expect(isHttpUrl('mailto:rav@example.com')).toBe(false)
  })

  it('rejects a bare domain with no scheme, and junk', () => {
    expect(isHttpUrl('example.com')).toBe(false)
    expect(isHttpUrl('not a url')).toBe(false)
    expect(isHttpUrl('')).toBe(false)
  })

  it('rejects a scheme disguised with leading whitespace', () => {
    expect(isHttpUrl('  javascript:alert(1)')).toBe(false)
  })
})

describe('validateContact', () => {
  it('accepts a name with a valid phone', () => {
    expect(validateContact(contact())).toEqual([])
  })

  it('accepts a name with only an email', () => {
    expect(validateContact(contact({ phone: '', email: 'rivka@example.com' }))).toEqual([])
  })

  it('requires a name', () => {
    expect(validateContact(contact({ fullName: '   ' }))).toContain('Name is required.')
  })

  it('requires at least one way to reach back', () => {
    expect(validateContact(contact({ phone: '', email: '' }))).toContain(
      'A phone number or email is required.',
    )
  })

  it('rejects an implausible phone number when one is given', () => {
    expect(validateContact(contact({ phone: '123' }))).toContain(
      'Please enter a valid phone number.',
    )
  })

  it('does not complain about the phone when only an email is supplied', () => {
    expect(validateContact(contact({ phone: '', email: 'rivka@example.com' }))).toEqual([])
  })

  it('caps each field’s length', () => {
    const errs = validateContact(
      contact({
        fullName: 'a'.repeat(LIMITS.name + 1),
        phone: '2'.repeat(LIMITS.phone + 1),
        email: `${'a'.repeat(LIMITS.email)}@example.com`,
      }),
    )
    expect(errs).toContain('Name is too long.')
    expect(errs).toContain('Phone number is too long.')
    expect(errs).toContain('Email is too long.')
  })
})
