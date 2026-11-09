// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEAVE_QUESTION, guardHere } from './backGuard'

// What runs after it, as the router's listener does.
const router = vi.fn()
let unguard: (() => void) | null = null

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/page')
  window.addEventListener('popstate', router)
})
afterEach(() => {
  unguard?.()
  unguard = null
  window.removeEventListener('popstate', router)
  vi.restoreAllMocks()
  delete (globalThis as { navigation?: unknown }).navigation
})

/** The browser moving to `path`, as Back or Forward does. */
function moveTo(path: string) {
  window.history.replaceState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
}

describe('backGuard', () => {
  it('asks before the router hears a move off the screen; No keeps the router from it and steps back', () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    unguard = guardHere()
    moveTo('/admin/list')
    expect(ask).toHaveBeenCalledWith(LEAVE_QUESTION)
    expect(router).not.toHaveBeenCalled()
    expect(go).toHaveBeenCalledWith(1)
  })

  it('hands the move on to the router once on Yes', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    unguard = guardHere()
    moveTo('/admin/list')
    expect(router).toHaveBeenCalledTimes(1)
  })

  it('steps back the way it came: after Forward, back again', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    const navigation = { currentEntry: { index: 4 } }
    ;(globalThis as { navigation?: unknown }).navigation = navigation
    unguard = guardHere()
    navigation.currentEntry.index = 5
    moveTo('/admin/page?field=a')
    navigation.currentEntry.index = 7
    moveTo('/admin/elsewhere')
    expect(go).toHaveBeenCalledWith(-2)
  })

  it('lets moves within the screen, to a screen sharing its changes, or with nothing guarded, through', () => {
    const ask = vi.spyOn(window, 'confirm')
    unguard = guardHere((path) => path === '/admin/sibling')
    moveTo('/admin/page?field=a')
    moveTo('/admin/sibling')
    unguard()
    unguard = null
    moveTo('/admin/list')
    expect(ask).not.toHaveBeenCalled()
    expect(router).toHaveBeenCalledTimes(3)
  })
})
