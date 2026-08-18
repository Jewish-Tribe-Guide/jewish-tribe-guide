import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ContactHospitalData } from '@/types'
import { submitRequest } from './submitRequest'

const contact: ContactHospitalData = {
  fullName: 'Jane Doe',
  phone: '215-555-0100',
  email: 'jane@example.com',
  hospitalId: 'h1',
  unitFloorRoom: '',
  preferredContact: 'phone',
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('submitRequest', () => {
  it('POSTs the full payload shape, including the honeypot/turnstile/formId fields', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ ok: true, requestId: 'REQ-1' }))
    vi.stubGlobal('fetch', fetchSpy)

    await submitRequest('Direct Support', contact, { note: 'x' }, 'trap-value', 'turnstile-token', 'form-1')

    expect(fetchSpy).toHaveBeenCalledWith('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: 'Direct Support',
        formId: 'form-1',
        contact,
        formData: { note: 'x' },
        company: 'trap-value',
        turnstileToken: 'turnstile-token',
      }),
    })
  })

  it('resolves with the request id on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: true, requestId: 'REQ-42' })))
    const result = await submitRequest('Direct Support', contact, {})
    expect(result).toEqual({ ok: true, requestId: 'REQ-42' })
  })

  it('throws the server-provided validation errors, joined, when the response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ ok: false, errors: ['Name is required.', 'Phone is invalid.'] }, false)),
    )
    await expect(submitRequest('Direct Support', contact, {})).rejects.toThrow(
      'Name is required. Phone is invalid.',
    )
  })

  it('throws a generic message when ok but body.ok is falsy with no errors array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: false })))
    await expect(submitRequest('Direct Support', contact, {})).rejects.toThrow(
      'Something went wrong. Please try again.',
    )
  })

  it('throws a network-specific message when fetch itself throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(submitRequest('Direct Support', contact, {})).rejects.toThrow(
      'Network error. Please check your connection and try again.',
    )
  })

  it('falls back to a generic message when the response body is not valid JSON', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error('not json')
      },
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchSpy)

    await expect(submitRequest('Direct Support', contact, {})).rejects.toThrow(
      'Something went wrong. Please try again.',
    )
  })
})
