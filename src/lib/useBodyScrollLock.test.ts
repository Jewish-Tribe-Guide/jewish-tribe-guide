// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { cleanup, render } from '@testing-library/react'
import { useBodyScrollLock } from './useBodyScrollLock'

afterEach(() => {
  cleanup()
  document.documentElement.style.overflow = ''
  document.body.style.overflow = ''
  document.body.style.overscrollBehaviorX = ''
})

function Locker({ active }: { active: boolean }) {
  useBodyScrollLock(active)
  return null
}

describe('useBodyScrollLock', () => {
  // <html>, not <body>: this app's real scrolling element is <html> (see
  // globals.css's own comment on why `overflow-x: hidden` lives there), so
  // locking body.style.overflow was a no-op for the actual page scroll —
  // confirmed live, a scroll gesture over an "open" dialog still moved
  // window.scrollY. Locking body only, the pre-fix behavior, would leave
  // this assertion false.
  it('locks the real scrolling element (html) while active, unlocks once inactive', () => {
    const { rerender, unmount } = render(createElement(Locker, { active: false }))
    expect(document.documentElement.style.overflow).toBe('')

    rerender(createElement(Locker, { active: true }))
    expect(document.documentElement.style.overflow).toBe('hidden')

    rerender(createElement(Locker, { active: false }))
    expect(document.documentElement.style.overflow).toBe('')

    unmount()
    expect(document.documentElement.style.overflow).toBe('')
  })

  // overscroll-behavior-x on <body> was tried once already to paper over the
  // same scroll leak, and it silently disabled the trackpad back-navigation
  // gesture for as long as any dialog was open — the same regression
  // globals.css's <html> comment documents once already (commit d6261b6).
  // Locking the real scrolling element removes the leak at its source, so
  // this hook has no business touching overscroll-behavior at all.
  it('never sets overscroll-behavior-x (that broke trackpad back-navigation once already)', () => {
    const { rerender } = render(createElement(Locker, { active: false }))
    rerender(createElement(Locker, { active: true }))

    expect(document.body.style.overscrollBehaviorX).toBe('')
    expect(document.documentElement.style.overscrollBehaviorX).toBe('')
  })

  // The actual bug (ListingDetailModal, arrow-key next/prev): closing one
  // card's dialog and opening a sibling's happens as two setState calls in
  // the same event handler (GenericDirectory's navigateFromCard), which
  // React batches into ONE commit — both Lockers below re-render together,
  // the same way. A plain `document.documentElement.style.overflow =
  // active ? 'hidden' : ''` per instance would race there: whichever
  // instance's effect happened to run last inside that commit would win,
  // with no guarantee it was the right one. This renders both from ONE
  // parent so their active props flip in a single real commit, not two
  // independent ones.
  it('stays locked when one instance closes and another opens in the same commit', () => {
    function Pair({ aActive, bActive }: { aActive: boolean; bActive: boolean }) {
      return createElement('div', null, createElement(Locker, { active: aActive }), createElement(Locker, { active: bActive }))
    }

    const { rerender, unmount } = render(createElement(Pair, { aActive: true, bActive: false }))
    expect(document.documentElement.style.overflow).toBe('hidden')

    // A closes, B opens — one commit, same as navigateFromCard's close()+open().
    rerender(createElement(Pair, { aActive: false, bActive: true }))
    expect(document.documentElement.style.overflow).toBe('hidden')

    unmount()
    expect(document.documentElement.style.overflow).toBe('')
  })
})
