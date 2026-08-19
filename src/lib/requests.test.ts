import { describe, expect, it } from 'vitest'
import type { ContactHospitalData } from '@/types'
import { generateRequestId, PREFERRED_CONTACT_LABELS, validateSubmission } from './requests'

function contact(overrides: Partial<ContactHospitalData> = {}): ContactHospitalData {
  return {
    fullName: 'Jane Doe',
    phone: '215-555-0100',
    email: 'jane@example.com',
    hospitalId: 'h1',
    unitFloorRoom: '',
    preferredContact: 'phone',
    ...overrides,
  }
}

describe('generateRequestId', () => {
  it('produces an REQ-<time>-<rand> shaped, uppercase id', () => {
    const id = generateRequestId()
    expect(id).toMatch(/^REQ-[0-9A-Z]+-[0-9A-Z]{4}$/)
  })

  it('is not the same value twice in a row', () => {
    expect(generateRequestId()).not.toBe(generateRequestId())
  })
})

// ── validateSubmission ───────────────────────────────────────────────────────

describe('validateSubmission', () => {
  it('requires a request type', () => {
    expect(validateSubmission({ requestType: '', contact: contact(), formData: {} })).toEqual([
      'Request type is required.',
    ])
  })

  it('delegates non-Feedback requests to validateContact', () => {
    expect(
      validateSubmission({
        requestType: 'Direct Support',
        contact: contact({ fullName: '' }),
        formData: {},
      }),
    ).toContain('Name is required.')
    expect(
      validateSubmission({ requestType: 'Direct Support', contact: contact(), formData: {} }),
    ).toEqual([])
  })

  describe('Feedback', () => {
    it('requires a non-blank message', () => {
      expect(
        validateSubmission({ requestType: 'Feedback', contact: contact(), formData: { message: '   ' } }),
      ).toContain('Please enter your feedback.')
    })

    it('flags an overlong message', () => {
      expect(
        validateSubmission({
          requestType: 'Feedback',
          contact: contact(),
          formData: { message: 'x'.repeat(2500) },
        }),
      ).toContain('Feedback is too long.')
    })

    it('flags an overlong email but does not require a phone (feedback skips validateContact)', () => {
      const errs = validateSubmission({
        requestType: 'Feedback',
        contact: contact({ phone: '', email: 'x'.repeat(250) }),
        formData: { message: 'Great site!' },
      })
      expect(errs).toEqual(['Email is too long.'])
    })

    it('accepts a valid feedback payload with no contact info at all', () => {
      expect(
        validateSubmission({
          requestType: 'Feedback',
          contact: contact({ phone: '', email: '' }),
          formData: { message: 'Great site!' },
        }),
      ).toEqual([])
    })
  })
})

// ── PREFERRED_CONTACT_LABELS ──────────────────────────────────────────────────

describe('PREFERRED_CONTACT_LABELS', () => {
  it('maps each known preferred-contact code to its human label', () => {
    expect(PREFERRED_CONTACT_LABELS).toEqual({
      phone: 'Phone call',
      text: 'Text message',
      email: 'Email',
    })
  })
})
