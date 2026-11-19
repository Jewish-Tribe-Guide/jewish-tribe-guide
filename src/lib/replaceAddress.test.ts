// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { replaceAddress } from './replaceAddress'

afterEach(() => vi.restoreAllMocks())

describe('replaceAddress', () => {
  it('changes the address with the state as it was, less Next’s own mark', () => {
    window.history.replaceState({ __NA: true, step: 'listing', __PRIVATE_NEXTJS_INTERNALS_TREE: 1 }, '', '/philly/admin/places?x=1')
    const spy = vi.spyOn(window.history, 'replaceState')
    replaceAddress('/philly/admin/places')
    expect(spy).toHaveBeenCalledWith({ step: 'listing', __PRIVATE_NEXTJS_INTERNALS_TREE: 1 }, '', '/philly/admin/places')
    expect(window.location.pathname + window.location.search).toBe('/philly/admin/places')
  })

  it('works with no state at all', () => {
    window.history.replaceState(null, '', '/a')
    replaceAddress('/b')
    expect(window.location.pathname).toBe('/b')
  })
})
