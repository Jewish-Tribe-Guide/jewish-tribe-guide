import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchPlaceSync,
  findPlaceId,
  googleHoursToStructured,
  nextGoogleFields,
  syncMayWrite,
} from './googlePlaces'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env.GOOGLE_MAPS_SERVER_KEY = 'test-key'
  delete process.env.GOOGLE_GEOCODING_API_KEY
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ── syncMayWrite ─────────────────────────────────────────────────────────────

describe('syncMayWrite', () => {
  describe('address', () => {
    it('may write when the current address is empty', () => {
      expect(syncMayWrite(null, 'address', null)).toBe(true)
      expect(syncMayWrite(null, 'address', '')).toBe(true)
      expect(syncMayWrite(null, 'address', '   ')).toBe(true)
    })

    it('never writes over a curated address, regardless of provenance', () => {
      expect(syncMayWrite({ googleFields: ['address'] }, 'address', '123 Main St')).toBe(false)
      expect(syncMayWrite(null, 'address', '123 Main St')).toBe(false)
    })
  })

  describe('with recorded provenance', () => {
    it('writes a field only when it is listed in googleFields', () => {
      const details = { googleFields: ['hours', 'phone'] }
      expect(syncMayWrite(details, 'hours', { mon: null })).toBe(true)
      expect(syncMayWrite(details, 'phone', '215-555-0100')).toBe(true)
      expect(syncMayWrite(details, 'name', 'Some Name')).toBe(false)
    })

    it('respects a deliberately-cleared owned field: blank does not fall back to gap-filling', () => {
      // Phone isn't in googleFields, so even though it's blank, it's the
      // submitter's — someone cleared a wrong autofilled number on purpose.
      const details = { googleFields: ['hours'] }
      expect(syncMayWrite(details, 'phone', '')).toBe(false)
    })
  })

  describe('without recorded provenance (pre-form rows)', () => {
    it('fills gaps only', () => {
      expect(syncMayWrite(undefined, 'name', null)).toBe(true)
      expect(syncMayWrite({}, 'phone', '')).toBe(true)
      expect(syncMayWrite({}, 'hours', {})).toBe(true)
    })

    it('never overwrites a value that is already present', () => {
      expect(syncMayWrite({}, 'name', 'Existing Name')).toBe(false)
      expect(syncMayWrite({}, 'hours', { mon: { open: '09:00', close: '17:00' } })).toBe(false)
    })
  })
})

// ── nextGoogleFields ─────────────────────────────────────────────────────────

describe('nextGoogleFields', () => {
  it('starts from nothing when there is no prior ownership', () => {
    expect(nextGoogleFields(null, ['name', 'hours'])).toEqual(['name', 'hours'])
  })

  it('is additive: a field owned before stays owned even if this run wrote nothing for it', () => {
    const details = { googleFields: ['name', 'hours', 'phone'] }
    expect(nextGoogleFields(details, [])).toEqual(['name', 'hours', 'phone'])
  })

  it('merges prior ownership with newly-written fields, deduped', () => {
    const details = { googleFields: ['name'] }
    expect(nextGoogleFields(details, ['name', 'address'])).toEqual(['name', 'address'])
  })

  it('always returns fields in canonical OWNABLE_SYNC_FIELDS order regardless of input order', () => {
    const details = { googleFields: ['phone', 'name'] }
    expect(nextGoogleFields(details, ['address'])).toEqual(['name', 'phone', 'address'])
  })

  it('ignores a malformed (non-array) prior value rather than throwing', () => {
    expect(nextGoogleFields({ googleFields: 'not-an-array' }, ['hours'])).toEqual(['hours'])
  })
})

// ── googleHoursToStructured ──────────────────────────────────────────────────

describe('googleHoursToStructured', () => {
  it('returns null when Google has no hours at all', () => {
    expect(googleHoursToStructured(undefined)).toBeNull()
    expect(googleHoursToStructured({})).toBeNull()
    expect(googleHoursToStructured({ periods: [] })).toBeNull()
  })

  it('maps a simple single-period-per-day week', () => {
    const result = googleHoursToStructured({
      periods: [
        { open: { day: 1, time: '0900' }, close: { day: 1, time: '1700' } },
        { open: { day: 2, time: '0900' }, close: { day: 2, time: '1700' } },
      ],
    })
    expect(result?.mon).toEqual({ open: '09:00', close: '17:00' })
    expect(result?.tue).toEqual({ open: '09:00', close: '17:00' })
    expect(result?.sun).toBeNull()
    expect(result?.wed).toBeNull()
  })

  it('treats the 24/7 special case as every day 00:00-23:59', () => {
    const result = googleHoursToStructured({
      periods: [{ open: { day: 0, time: '0000' } }],
    })
    expect(result?.sun).toEqual({ open: '00:00', close: '23:59' })
    expect(result?.sat).toEqual({ open: '00:00', close: '23:59' })
  })

  it('does not treat a single dated period with an explicit close as 24/7', () => {
    const result = googleHoursToStructured({
      periods: [{ open: { day: 0, time: '0000' }, close: { day: 0, time: '1200' } }],
    })
    expect(result?.sun).toEqual({ open: '00:00', close: '12:00' })
    expect(result?.mon).toBeNull()
  })

  it('caps an overnight period (close rolls to the next day) at 23:59 on the open day', () => {
    const result = googleHoursToStructured({
      periods: [{ open: { day: 5, time: '1800' }, close: { day: 6, time: '0200' } }],
    })
    expect(result?.fri).toEqual({ open: '18:00', close: '23:59' })
    // The rollover close is attributed to the open day, not written to Saturday.
    expect(result?.sat).toBeNull()
  })

  it('collapses split hours (e.g. a lunch break) to the widest open/close of the day', () => {
    const result = googleHoursToStructured({
      periods: [
        { open: { day: 3, time: '0900' }, close: { day: 3, time: '1200' } },
        { open: { day: 3, time: '1300' }, close: { day: 3, time: '2100' } },
      ],
    })
    expect(result?.wed).toEqual({ open: '09:00', close: '21:00' })
  })

  it('widens correctly regardless of period order within the day', () => {
    const result = googleHoursToStructured({
      periods: [
        { open: { day: 4, time: '1300' }, close: { day: 4, time: '2100' } },
        { open: { day: 4, time: '0900' }, close: { day: 4, time: '1200' } },
      ],
    })
    expect(result?.thu).toEqual({ open: '09:00', close: '21:00' })
  })

  it('ignores a period with an out-of-range day index rather than throwing', () => {
    const result = googleHoursToStructured({
      periods: [{ open: { day: 7, time: '0900' }, close: { day: 7, time: '1700' } }],
    })
    expect(result?.sun).toBeNull()
    expect(result?.mon).toBeNull()
  })
})

// ── findPlaceId ──────────────────────────────────────────────────────────────

describe('findPlaceId', () => {
  it('returns null when no server key is configured', async () => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY
    delete process.env.GOOGLE_GEOCODING_API_KEY
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await findPlaceId('Some Shul', '123 Main St')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falls back to the geocoding key when the server key is unset', async () => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY
    process.env.GOOGLE_GEOCODING_API_KEY = 'geo-key'
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'OK', candidates: [{ place_id: 'abc' }] }),
    })
    vi.stubGlobal('fetch', fetchSpy)
    expect(await findPlaceId('Some Shul', '123 Main St')).toBe('abc')
    expect(fetchSpy.mock.calls[0][0]).toContain('key=geo-key')
  })

  it('returns null when both name and address are blank', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await findPlaceId('', '')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns the place_id from a successful match', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'OK', candidates: [{ place_id: 'place-123' }] }),
    })
    vi.stubGlobal('fetch', fetchSpy)
    expect(await findPlaceId('Some Shul', '123 Main St')).toBe('place-123')
  })

  it('returns null when the HTTP response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await findPlaceId('Some Shul', '123 Main St')).toBeNull()
  })

  it('returns null when Google reports a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ZERO_RESULTS' }) }),
    )
    expect(await findPlaceId('Some Shul', '123 Main St')).toBeNull()
  })

  it('returns null when no candidates are present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'OK', candidates: [] }) }),
    )
    expect(await findPlaceId('Some Shul', '123 Main St')).toBeNull()
  })

  it('returns null when fetch throws (network failure)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    expect(await findPlaceId('Some Shul', '123 Main St')).toBeNull()
  })
})

// ── fetchPlaceSync ───────────────────────────────────────────────────────────

describe('fetchPlaceSync', () => {
  it('returns null when no server key is configured', async () => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY
    delete process.env.GOOGLE_GEOCODING_API_KEY
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await fetchPlaceSync('place-123')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('maps a full successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'OK',
          result: {
            name: 'Some Shul',
            business_status: 'OPERATIONAL',
            formatted_phone_number: '(215) 555-0100',
            formatted_address: '123 Main St, Philadelphia, PA',
            opening_hours: { periods: [{ open: { day: 0, time: '0900' }, close: { day: 0, time: '1700' } }] },
            editorial_summary: { overview: 'A local shul.' },
          },
        }),
      }),
    )
    const result = await fetchPlaceSync('place-123')
    expect(result).toEqual({
      name: 'Some Shul',
      hours: expect.objectContaining({ sun: { open: '09:00', close: '17:00' } }),
      phone: '(215) 555-0100',
      address: '123 Main St, Philadelphia, PA',
      businessStatus: 'OPERATIONAL',
      description: 'A local shul.',
    })
  })

  it('maps missing optional fields to null rather than undefined', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'OK', result: {} }),
      }),
    )
    const result = await fetchPlaceSync('place-123')
    expect(result).toEqual({
      name: null,
      hours: null,
      phone: null,
      address: null,
      businessStatus: null,
      description: null,
    })
  })

  it('normalizes an unrecognized business_status to null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'OK', result: { business_status: 'SOME_NEW_STATUS' } }),
      }),
    )
    const result = await fetchPlaceSync('place-123')
    expect(result?.businessStatus).toBeNull()
  })

  it('returns null when the HTTP response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await fetchPlaceSync('place-123')).toBeNull()
  })

  it('returns null when Google reports a non-OK status or missing result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'NOT_FOUND' }) }),
    )
    expect(await fetchPlaceSync('place-123')).toBeNull()
  })

  it('returns null when fetch throws (network failure)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    expect(await fetchPlaceSync('place-123')).toBeNull()
  })
})
