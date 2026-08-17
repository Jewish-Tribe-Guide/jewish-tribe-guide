import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchJson, parseOkJson } from './fetchJson'

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response
}

afterEach(() => vi.unstubAllGlobals())

describe('parseOkJson', () => {
  it('resolves with the parsed body when ok', async () => {
    const res = jsonResponse(200, { ok: true, listings: ['a'] })
    await expect(parseOkJson(res, 'Failed.')).resolves.toEqual({ ok: true, listings: ['a'] })
  })

  it('throws the server-provided message when the HTTP status is not ok', async () => {
    const res = jsonResponse(500, { ok: false, errors: ['Something broke'] })
    await expect(parseOkJson(res, 'Failed to load.')).rejects.toThrow('Something broke')
  })

  it('throws even on a 200 status if the body says ok: false', async () => {
    // The pattern this replaces always checked BOTH — a 200 with a
    // validation failure in the body is exactly the case that guards against.
    const res = jsonResponse(200, { ok: false, errors: ['Validation failed'] })
    await expect(parseOkJson(res, 'Failed.')).rejects.toThrow('Validation failed')
  })

  it('joins multiple error strings with a space', async () => {
    const res = jsonResponse(400, { ok: false, errors: ['Name is required.', 'Email is invalid.'] })
    await expect(parseOkJson(res, 'Failed.')).rejects.toThrow('Name is required. Email is invalid.')
  })

  it('falls back to the given message when the body carries no errors', async () => {
    const res = jsonResponse(500, {})
    await expect(parseOkJson(res, 'Save failed.')).rejects.toThrow('Save failed.')
  })

  it('falls back to the given message when errors is present but empty', async () => {
    const res = jsonResponse(400, { ok: false, errors: [] })
    await expect(parseOkJson(res, 'Delete failed.')).rejects.toThrow('Delete failed.')
  })
})

describe('fetchJson', () => {
  it('fetches, then applies the same ok-check as parseOkJson', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, count: 3 })))
    await expect(fetchJson('/api/votes', { method: 'GET' }, 'Failed.')).resolves.toEqual({ ok: true, count: 3 })
  })

  it('passes the url and init straight through to fetch', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchSpy)
    const init = { method: 'POST', headers: { Authorization: 'Bearer t' }, body: '{}' }

    await fetchJson('/api/admin/categories', init, 'Failed.')

    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/categories', init)
  })

  it('rejects with the fallback message on a failed request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, { ok: false })))
    await expect(fetchJson('/api/x', {}, 'Could not find it.')).rejects.toThrow('Could not find it.')
  })
})
