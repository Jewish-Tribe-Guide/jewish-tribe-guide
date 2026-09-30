import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askReader, forgetReaderAnswers } from './askReader'

const fetchMock = vi.fn()
const answer = (body: unknown) => Promise.resolve(Response.json(body))
const reading = { categories: [{ id: 'restaurant' }] }

beforeEach(() => {
  forgetReaderAnswers()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('askReader — the page asking the reader', () => {
  it('asks once per question however it’s typed, for this community', async () => {
    fetchMock.mockImplementation(() => answer({ ok: true, reading }))
    expect(await askReader('Kosher food?', 'philly')).toEqual({ ok: true, reading })
    expect(await askReader('kosher  food', 'philly')).toEqual({ ok: true, reading })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/ask/read?community=philly')
    await askReader('kosher food', 'ues')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('once the reader is off, never asks again this visit', async () => {
    fetchMock.mockImplementation(() => answer({ ok: false, reason: 'off' }))
    expect(await askReader('meat', 'philly')).toEqual({ ok: false, reason: 'off' })
    expect(await askReader('dairy', 'philly')).toEqual({ ok: false, reason: 'off' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('busy or failed can be tried again, and a network error is only "failed"', async () => {
    fetchMock.mockImplementationOnce(() => answer({ ok: false, reason: 'busy' }))
    expect(await askReader('meat', 'philly')).toEqual({ ok: false, reason: 'busy' })
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('offline')))
    expect(await askReader('meat', 'philly')).toEqual({ ok: false, reason: 'failed' })
    fetchMock.mockImplementationOnce(() => answer({ ok: true, reading }))
    expect(await askReader('meat', 'philly')).toEqual({ ok: true, reading })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
