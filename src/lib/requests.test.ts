import { describe, expect, it } from 'vitest'
import type { ContactHospitalData } from '@/types'
import {
  buildFeedbackSheetRow,
  buildSheetRow,
  buildVolunteerChangeSheetRow,
  buildVolunteerSheetRow,
  generateRequestId,
  hospitalName,
  PREFERRED_CONTACT_LABELS,
  SHEET_COLUMNS,
  validateSubmission,
  type SubmissionPayload,
} from './requests'

// Pure functions throughout — no Supabase, no mocking. Real risk here is a
// silently mis-shaped/mis-labeled row in the ops spreadsheet staff act on.

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

// ── hospitalName / generateRequestId ─────────────────────────────────────────

describe('hospitalName', () => {
  it('resolves a known id to its name', () => {
    expect(hospitalName('h1', { h1: 'General Hospital' })).toBe('General Hospital')
  })

  it('falls back to the raw id when unknown', () => {
    expect(hospitalName('unknown-id', {})).toBe('unknown-id')
  })
})

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

// ── buildSheetRow ─────────────────────────────────────────────────────────────

describe('buildSheetRow', () => {
  it('builds a row matching SHEET_COLUMNS order, resolving the hospital name', () => {
    const payload: SubmissionPayload = {
      requestType: 'Direct Support',
      contact: contact(),
      formData: { note: 'needs a ride' },
    }
    const row = buildSheetRow(payload, 'REQ-123', '2026-01-01T00:00:00Z', { h1: 'General Hospital' })

    expect(row).toHaveLength(SHEET_COLUMNS.length)
    expect(row).toEqual([
      '2026-01-01T00:00:00Z',
      'REQ-123',
      'Direct Support',
      'General Hospital',
      'Jane Doe',
      '215-555-0100',
      'jane@example.com',
      'New',
      '',
      '{"note":"needs a ride"}',
    ])
  })
})

// ── buildVolunteerSheetRow ────────────────────────────────────────────────────

describe('buildVolunteerSheetRow', () => {
  it('maps every code to its human label and joins multi-value fields with ", "', () => {
    const payload: SubmissionPayload = {
      requestType: 'Volunteer',
      contact: contact({ preferredContact: 'text' }),
      formData: {
        waysToHelp: ['meals', 'visiting'],
        hospitals: ['h1', 'anywhere'],
        availability: ['weekends', 'flexible'],
        hasCar: 'sometimes',
        notes: 'happy to help',
      },
    }
    const row = buildVolunteerSheetRow(payload, 'REQ-1', 't', { h1: 'General Hospital' })

    expect(row).toEqual([
      't',
      'REQ-1',
      'Jane Doe',
      '215-555-0100',
      'jane@example.com',
      'Text message',
      'Preparing or delivering meals, Visiting patients (Bikur Cholim)',
      'General Hospital, Anywhere in the Philadelphia area',
      'Weekends, Flexible / varies',
      'Sometimes',
      'happy to help',
      JSON.stringify(payload.formData),
    ])
  })

  it('labels "other" as "Other: <the typed detail>" when provided, falling back to the bare label otherwise', () => {
    const withDetail = buildVolunteerSheetRow(
      {
        requestType: 'Volunteer',
        contact: contact(),
        formData: { waysToHelp: ['other'], waysToHelpOther: 'Driving to shul' },
      },
      'REQ-1',
      't',
      {},
    )
    expect(withDetail[6]).toBe('Other: Driving to shul')

    const withoutDetail = buildVolunteerSheetRow(
      { requestType: 'Volunteer', contact: contact(), formData: { waysToHelp: ['other'] } },
      'REQ-1',
      't',
      {},
    )
    expect(withoutDetail[6]).toBe('Other')
  })

  it('falls back to the raw code for an unrecognized ways-to-help/availability/hasCar value', () => {
    const row = buildVolunteerSheetRow(
      {
        requestType: 'Volunteer',
        contact: contact(),
        formData: { waysToHelp: ['some-new-code'], availability: ['some-new-slot'], hasCar: 'unknown' },
      },
      'REQ-1',
      't',
      {},
    )
    expect(row[6]).toBe('some-new-code')
    expect(row[8]).toBe('some-new-slot')
    expect(row[9]).toBe('unknown')
  })

  it('defaults every optional array/field to empty when the payload omits them', () => {
    const row = buildVolunteerSheetRow(
      { requestType: 'Volunteer', contact: contact(), formData: {} },
      'REQ-1',
      't',
      {},
    )
    expect(row[6]).toBe('') // waysToHelp
    expect(row[7]).toBe('') // hospitals
    expect(row[8]).toBe('') // availability
    expect(row[9]).toBe('') // hasCar
    expect(row[10]).toBe('') // notes
  })
})

// ── buildFeedbackSheetRow ─────────────────────────────────────────────────────

describe('buildFeedbackSheetRow', () => {
  it('builds the 5-column feedback row', () => {
    const row = buildFeedbackSheetRow(
      { requestType: 'Feedback', contact: contact({ email: 'jane@example.com' }), formData: { message: 'Nice!' } },
      'REQ-1',
      't',
    )
    expect(row).toEqual(['t', 'REQ-1', 'Nice!', 'jane@example.com', 'New'])
  })

  it('defaults a missing message to an empty string rather than "undefined"', () => {
    const row = buildFeedbackSheetRow(
      { requestType: 'Feedback', contact: contact({ email: '' }), formData: {} },
      'REQ-1',
      't',
    )
    expect(row[2]).toBe('')
  })
})

// ── buildVolunteerChangeSheetRow ──────────────────────────────────────────────

describe('buildVolunteerChangeSheetRow', () => {
  it("builds a 'Removal' row with the reason in the Notes column and everything volunteer-specific blank", () => {
    const row = buildVolunteerChangeSheetRow(
      {
        requestType: 'Volunteer Removal',
        contact: contact(),
        formData: { reason: 'moving away' },
      },
      'REQ-1',
      't',
      {},
    )
    expect(row[2]).toBe('Removal')
    expect(row[7]).toBe('') // Ways to Help
    expect(row[8]).toBe('') // Areas
    expect(row[9]).toBe('') // Availability
    expect(row[10]).toBe('') // Has Car
    expect(row[11]).toBe('moving away')
  })

  it("builds an 'Edit' row with the full restated commitment, same shape as a signup row", () => {
    const row = buildVolunteerChangeSheetRow(
      {
        requestType: 'Volunteer Edit',
        contact: contact(),
        formData: { waysToHelp: ['meals'], hospitals: ['h1'], availability: ['weekends'], hasCar: 'yes' },
      },
      'REQ-1',
      't',
      { h1: 'General Hospital' },
    )
    expect(row[2]).toBe('Edit')
    expect(row[7]).toBe('Preparing or delivering meals')
    expect(row[8]).toBe('General Hospital')
    expect(row[9]).toBe('Weekends')
    expect(row[10]).toBe('Yes')
  })
})

// ── PREFERRED_CONTACT_LABELS fallback (shared across the row builders) ───────

describe('preferred-contact label fallback', () => {
  it('falls back to the raw value for an unrecognized preferredContact, and empty string when unset', () => {
    expect(PREFERRED_CONTACT_LABELS.phone).toBe('Phone call')
    const row = buildVolunteerSheetRow(
      { requestType: 'Volunteer', contact: contact({ preferredContact: 'carrier-pigeon' }), formData: {} },
      'REQ-1',
      't',
      {},
    )
    expect(row[5]).toBe('carrier-pigeon')
  })
})
