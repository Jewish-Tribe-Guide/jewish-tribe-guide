// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { cleanup, render } from '@testing-library/react'
import { useBodyScrollLock } from './useBodyScrollLock'

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
  document.body.style.overscrollBehaviorX = ''
})

function Locker({ active }: { active: boolean }) {
  useBodyScrollLock(active)
  return null
}

describe('useBodyScrollLock', () => {
  it('locks the body while active, unlocks once inactive', () => {
    const { rerender, unmount } = render(createElement(Locker, { active: false }))
    expect(document.body.style.overflow).toBe('')

    rerender(createElement(Locker, { active: true }))
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.body.style.overscrollBehaviorX).toBe('none')

    rerender(createElement(Locker, { active: false }))
    expect(document.body.style.overflow).toBe('')
    expect(document.body.style.overscrollBehaviorX).toBe('')

    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  // The actual bug (ListingDetailModal, arrow-key next/prev): closing one
  // card's dialog and opening a sibling's happens as two setState calls in
  // the same event handler (GenericDirectory's navigateFromCard), which
  // React batches into ONE commit — both Lockers below re-render together,
  // the same way. A plain `document.body.style.overflow = active ? 'hidden'
  // : ''` per instance raced there: whichever instance's effect happened to
  // run last inside that commit won, with no guarantee it was the right
  // one. This renders both from ONE parent so their active props flip in a
  // single real commit, not two independent ones.
  it('stays locked when one instance closes and another opens in the same commit', () => {
    function Pair({ aActive, bActive }: { aActive: boolean; bActive: boolean }) {
      return createElement('div', null, createElement(Locker, { active: aActive }), createElement(Locker, { active: bActive }))
    }

    const { rerender, unmount } = render(createElement(Pair, { aActive: true, bActive: false }))
    expect(document.body.style.overflow).toBe('hidden')

    // A closes, B opens — one commit, same as navigateFromCard's close()+open().
    rerender(createElement(Pair, { aActive: false, bActive: true }))
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('')
  })
})
