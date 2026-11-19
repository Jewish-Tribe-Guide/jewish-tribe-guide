// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEditFormHistory } from './useEditFormHistory'

// The listing editor's history entries, shared by the computer's listing
// dialog and the map's place sheet since Nov 18 (review item 42). Each kept
// its own keys, which other screens read (the map's back reads mapSheetForm).

afterEach(() => vi.restoreAllMocks())

const pop = (state: unknown) => act(() => void window.dispatchEvent(new PopStateEvent('popstate', { state })))

describe.each(['detailModal', 'mapSheet'] as const)('useEditFormHistory(%s)', (prefix) => {
  const form = `${prefix}Form`
  const removal = `${prefix}Removal`

  it('opens the editor as one entry on top of the listing’s, keeping what that entry held', () => {
    window.history.replaceState({ listing: 'x' }, '')
    const push = vi.spyOn(window.history, 'pushState')
    const { result } = renderHook(() => useEditFormHistory(prefix))

    act(() => result.current.openForm('edit'))

    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenLastCalledWith({ listing: 'x', [form]: 'edit' }, '')
    expect(result.current).toMatchObject({ formOpen: 'edit', removalOpen: false })
  })

  it('goes straight to Request removal as one entry, so Back is the listing', () => {
    const push = vi.spyOn(window.history, 'pushState')
    const { result } = renderHook(() => useEditFormHistory(prefix))

    act(() => result.current.openRemoval())

    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenLastCalledWith(expect.objectContaining({ [form]: 'edit', [removal]: true }), '')
    expect(result.current).toMatchObject({ formOpen: 'edit', removalOpen: true })
  })

  it('steps into removal as one more entry, and out of it with Back', () => {
    const push = vi.spyOn(window.history, 'pushState')
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const { result } = renderHook(() => useEditFormHistory(prefix))
    act(() => result.current.openForm('edit'))

    act(() => result.current.changeRemovalOpen(true))
    expect(push).toHaveBeenLastCalledWith(expect.objectContaining({ [removal]: true }), '')
    expect(result.current.removalOpen).toBe(true)

    act(() => result.current.changeRemovalOpen(false))
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('closes all the way out: one entry from the edit, two from removal', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    const { result } = renderHook(() => useEditFormHistory(prefix))

    act(() => result.current.openForm('edit'))
    result.current.closeForm()
    expect(back).toHaveBeenCalledTimes(1)

    act(() => result.current.changeRemovalOpen(true))
    result.current.closeForm()
    expect(go).toHaveBeenCalledWith(-2)
  })

  it('follows the browser’s Back and Forward through its own keys only', () => {
    const { result } = renderHook(() => useEditFormHistory(prefix))

    pop({ [form]: 'edit', [removal]: true })
    expect(result.current).toMatchObject({ formOpen: 'edit', removalOpen: true })

    pop({ [form]: 'edit' })
    expect(result.current).toMatchObject({ formOpen: 'edit', removalOpen: false })

    // The other host's entry is not this one's editor.
    const other = prefix === 'mapSheet' ? 'detailModal' : 'mapSheet'
    pop({ [`${other}Form`]: 'edit' })
    expect(result.current).toMatchObject({ formOpen: null, removalOpen: false })

    // A removal key with no editor under it opens nothing.
    pop({ [removal]: true })
    expect(result.current).toMatchObject({ formOpen: null, removalOpen: false })
  })

  it('forgets an editor left open, for a host that stays mounted while closed', () => {
    const { result } = renderHook(() => useEditFormHistory(prefix))
    act(() => result.current.openRemoval())

    act(() => result.current.reset())

    expect(result.current).toMatchObject({ formOpen: null, removalOpen: false })
  })

  it('hands back the same stepBack every render, so an effect can list it', () => {
    const { result, rerender } = renderHook(() => useEditFormHistory(prefix))
    const first = result.current.stepBack
    rerender()
    expect(result.current.stepBack).toBe(first)
  })
})
