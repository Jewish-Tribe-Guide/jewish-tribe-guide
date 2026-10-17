// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { countEvent, shouldCount } from './countEvent'

describe('shouldCount', () => {
  it('counts a real visitor on the public site', () => {
    expect(shouldCount({ webdriver: false }, '/philly/grocery')).toBe(true)
  })
  it('never counts an automated browser (the e2e suites must not write)', () => {
    expect(shouldCount({ webdriver: true }, '/philly/grocery')).toBe(false)
  })
  it('never counts the admin console', () => {
    expect(shouldCount({}, '/philly/admin')).toBe(false)
    expect(shouldCount({}, '/admin/philly/categories')).toBe(false)
    expect(shouldCount({}, '/philly/administrators-guide')).toBe(true)
  })
})

describe('countEvent', () => {
  afterEach(() => vi.restoreAllMocks())

  it('hands the count to sendBeacon when it can', () => {
    const beacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    countEvent('philly', 'listing_view', 'abc')
    expect(beacon).toHaveBeenCalledWith('/api/counts', expect.any(Blob))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falls back to a keepalive fetch when the beacon is refused', () => {
    Object.defineProperty(navigator, 'sendBeacon', { value: () => false, configurable: true })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    countEvent('philly', 'search_miss', 'pas yisroel')
    expect(fetchSpy).toHaveBeenCalledWith('/api/counts', expect.objectContaining({ method: 'POST', keepalive: true }))
    expect(JSON.parse(fetchSpy.mock.calls[0][1]!.body as string)).toEqual({ community: 'philly', kind: 'search_miss', key: 'pas yisroel' })
  })

  it('sends nothing from an automated browser', () => {
    const beacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true })
    countEvent('philly', 'listing_view', 'abc')
    expect(beacon).not.toHaveBeenCalled()
    Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true })
  })
})
