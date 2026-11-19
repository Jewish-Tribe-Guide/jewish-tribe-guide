// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorInAddress } from './useEditorInAddress'

// A listing's editor and its Request removal screen, in the address (Nov 19).
// They were entries pushed behind Next's router with nothing in the address:
// a reload went back to the listing with the editor still in the history.

// Next's router as it behaves here: an entry is written once the navigation
// lands, holding Next's own keys and none of the page's.
const NEXT_STATE = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: 'tree' }
const router = {
  push: vi.fn((url: string) => setTimeout(() => window.history.pushState(NEXT_STATE, '', url), 10)),
  replace: vi.fn((url: string) => setTimeout(() => window.history.replaceState(NEXT_STATE, '', url), 10)),
}
vi.mock('next/navigation', () => ({ useRouter: () => router }))

const here = () => window.location.pathname + window.location.search
const pop = () => act(() => void window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state })))

beforeEach(() => {
  // A listing open on a category page, its own entry marked as the page marks it.
  window.history.replaceState({ step: 'listing' }, '', '/philly/food?item=a1')
})
afterEach(() => vi.clearAllMocks())

describe('useEditorInAddress', () => {
  it('opens the editor as an entry of its own, at an address of its own, through the router', async () => {
    const { result } = renderHook(() => useEditorInAddress(true, 'a1'))

    act(() => result.current.openForm('edit'))

    expect(result.current).toMatchObject({ formOpen: 'edit', removalOpen: false })
    await waitFor(() => expect(here()).toBe('/philly/food?item=a1&editing=a1%7Elisting'))
    expect(router.push).toHaveBeenCalledTimes(1)
    // The listing's own mark comes along, so the page's Back and Forward
    // still find its listing open under the editor.
    await waitFor(() => expect(window.history.state).toMatchObject({ step: 'listing', __NA: true }))
    // The visitor's Back is the listing.
    window.history.back()
    await waitFor(() => expect(here()).toBe('/philly/food?item=a1'))
    expect(result.current.formOpen).toBeNull()
  })

  it('goes straight to Request removal as one entry, so Back is the listing', async () => {
    const { result } = renderHook(() => useEditorInAddress(true, 'a1'))

    act(() => result.current.openRemoval())
    expect(result.current).toMatchObject({ formOpen: 'edit', removalOpen: true })
    await waitFor(() => expect(here()).toBe('/philly/food?item=a1&editing=a1%7Eremoval'))

    act(() => result.current.stepBack())
    expect(result.current).toMatchObject({ formOpen: null, removalOpen: false })
    await waitFor(() => expect(here()).toBe('/philly/food?item=a1'))
  })

  it('steps into removal as one more entry, and out of it to the edit', async () => {
    const { result } = renderHook(() => useEditorInAddress(true, 'a1'))
    act(() => result.current.openForm('edit'))
    act(() => result.current.changeRemovalOpen(true))
    await waitFor(() => expect(here()).toBe('/philly/food?item=a1&editing=a1%7Elisting%2Fremoval'))
    expect(router.push).toHaveBeenCalledTimes(2)

    act(() => result.current.changeRemovalOpen(false))
    expect(result.current).toMatchObject({ formOpen: 'edit', removalOpen: false })
    await waitFor(() => expect(here()).toBe('/philly/food?item=a1&editing=a1%7Elisting'))
  })

  it('closes all the way out over every entry it has', async () => {
    const { result } = renderHook(() => useEditorInAddress(true, 'a1'))
    act(() => result.current.openForm('edit'))
    act(() => result.current.changeRemovalOpen(true))
    await waitFor(() => expect(here()).toBe('/philly/food?item=a1&editing=a1%7Elisting%2Fremoval'))

    act(() => result.current.closeForm())
    expect(result.current.formOpen).toBeNull()
    await waitFor(() => expect(here()).toBe('/philly/food?item=a1'))
    // Gone back over, not written on top: Forward is the editor again.
    window.history.forward()
    await waitFor(() => expect(here()).toBe('/philly/food?item=a1&editing=a1%7Elisting'))
    expect(result.current).toMatchObject({ formOpen: 'edit', removalOpen: false })
  })

  it('opens what the address names, as a reload does', () => {
    window.history.replaceState(null, '', '/philly/food/moms-kitchen?editing=a1%7Elisting%2Fremoval')
    const { result } = renderHook(() => useEditorInAddress(true, 'a1'))
    expect(result.current).toMatchObject({ formOpen: 'edit', removalOpen: true })
  })

  it('follows the browser’s Back and Forward by the address', () => {
    const { result } = renderHook(() => useEditorInAddress(true, 'a1'))

    window.history.replaceState(null, '', '/philly/map?place=a1&editing=a1%7Elisting')
    pop()
    expect(result.current).toMatchObject({ formOpen: 'edit', removalOpen: false })

    window.history.replaceState(null, '', '/philly/map?place=a1&editing=a1%7Eremoval')
    pop()
    expect(result.current).toMatchObject({ formOpen: 'edit', removalOpen: true })

    window.history.replaceState(null, '', '/philly/map?place=a1')
    pop()
    expect(result.current).toMatchObject({ formOpen: null, removalOpen: false })

    // A screen it doesn't know is none of its own.
    window.history.replaceState(null, '', '/philly/map?place=a1&editing=a1%7Ehours')
    pop()
    expect(result.current.formOpen).toBeNull()
  })

  // Under the listing's id: a phone's category page keeps the sheet of every
  // listing it has opened, and the Map draws the next place in a view of its
  // own, which read another listing's editor in the address as theirs.
  it('reads another listing’s editor as none of its own', async () => {
    const a = renderHook(() => useEditorInAddress(true, 'a1'))
    act(() => a.result.current.openForm('edit'))
    await waitFor(() => expect(here()).toContain('editing='))

    // b2's view, drawn after a1's editor is in the address.
    const b = renderHook(() => useEditorInAddress(true, 'b2'))
    expect(b.result.current.formOpen).toBeNull()
    pop()
    expect(b.result.current.formOpen).toBeNull()
    expect(a.result.current.formOpen).toBe('edit')
  })

  it('reads the address again when it shows another listing', async () => {
    const { result, rerender } = renderHook(({ id }) => useEditorInAddress(true, id), { initialProps: { id: 'a1' } })
    act(() => result.current.openForm('edit'))
    await waitFor(() => expect(here()).toContain('editing='))
    rerender({ id: 'b2' })
    expect(result.current.formOpen).toBeNull()
  })

  it('reads nothing and writes nothing when opened on the editor (the admin preview)', () => {
    window.history.replaceState(null, '', '/philly/food?editing=a1%7Elisting')
    const { result } = renderHook(() => useEditorInAddress(false, 'a1'))
    expect(result.current.formOpen).toBeNull()

    act(() => result.current.openForm('edit'))
    expect(result.current.formOpen).toBe('edit')
    act(() => result.current.closeForm())
    expect(result.current.formOpen).toBeNull()
    expect(router.push).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('hands back the same moves every render, so an effect can list them', () => {
    const { result, rerender } = renderHook(() => useEditorInAddress(true, 'a1'))
    const first = result.current.stepBack
    rerender()
    expect(result.current.stepBack).toBe(first)
  })
})
