// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { ADD_HERE, OPEN_ADD, requestAdd, useAddHere } from './addHere'

afterEach(() => cleanup())

// The computer's header "+ Add or update" (board D1b): the screen's own Add
// first, the site's only when the screen has none.
describe('requestAdd', () => {
  it('opens the site’s box when no screen takes it', () => {
    const site = vi.fn()
    document.addEventListener(OPEN_ADD, site)
    requestAdd()
    document.removeEventListener(OPEN_ADD, site)
    expect(site).toHaveBeenCalledTimes(1)
  })

  it('lets a screen with its own Add take it, and then not the site’s', () => {
    const site = vi.fn()
    const own = vi.fn()
    document.addEventListener(OPEN_ADD, site)
    renderHook(() => useAddHere(true, own))
    requestAdd()
    document.removeEventListener(OPEN_ADD, site)
    expect(own).toHaveBeenCalledTimes(1)
    expect(site).not.toHaveBeenCalled()
  })

  it('leaves it to the site while the screen can’t add', () => {
    const site = vi.fn()
    const own = vi.fn()
    document.addEventListener(OPEN_ADD, site)
    renderHook(() => useAddHere(false, own))
    requestAdd()
    document.removeEventListener(OPEN_ADD, site)
    expect(own).not.toHaveBeenCalled()
    expect(site).toHaveBeenCalledTimes(1)
  })

  it('stops taking it once the screen is gone', () => {
    const own = vi.fn()
    const { unmount } = renderHook(() => useAddHere(true, own))
    unmount()
    const here = new CustomEvent(ADD_HERE, { cancelable: true })
    document.dispatchEvent(here)
    expect(here.defaultPrevented).toBe(false)
    expect(own).not.toHaveBeenCalled()
  })
})
