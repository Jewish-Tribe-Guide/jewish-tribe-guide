import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { MINYANIM_STEP, type ParamsOpts } from './directoryAddress'

// Synagogues' Minyanim view, open or not, and how that follows the address
// (`?davening=1`): a step Back undoes when the page opens it (GenericDirectory).

export function useMinyanimView(openMinyanimView: boolean | undefined, onParamsChange?: (changes: Record<string, string | null>, opts?: ParamsOpts) => void) {
  // A plain lazy initializer here would only ever see the FIRST render:
  // SlugScreen's Suspense fallback renders this tree once with the query
  // string not yet read (openMinyanimView is undefined then, same as
  // `initialSearch` is at that point — see FindResources' own doc), then
  // FindResourcesConnected hydrates and this same component instance
  // re-renders with the real value — too late for a lazy initializer to
  // catch. Solved the same way `initialSearch` already is: FindResources
  // folds `openMinyanimView` into the `key` it gives ResourceLoader, so
  // the value arriving forces a fresh mount of this whole subtree instead
  // of an update to the existing one, and the lazy initializer below runs
  // again with the real value.
  // Synagogues' Minyanim view (step 4, agreed Oct 1): every minyan by time,
  // in place of the list of shuls. `?davening=1` (the home page's and the
  // Next minyan card's "All davening times") arrives on it. It replaced
  // the old week-of-times dialog, which knew nothing of Yom Tov.
  const [minyanimViewOn, setMinyanimViewOn] = useState(!!openMinyanimView)
  // Same one-way-in problem `search`/`openNow` already solve above: without
  // this, switching back to Synagogues left `?davening=1` sitting in the
  // URL, so a reload reopened the view the visitor had already left.
  // Clears `day` alongside `davening` — a stale `?day=` with no view to
  // pick a day in is meaningless on its own. Skips the
  // first render for the same reason `openNowSyncedOnce` does: the initial
  // value here is just `openMinyanimView` echoed back, and re-writing it
  // immediately would be a pointless replace on a URL that's already
  // correct.
  //
  // Only when the view opens or closes, never because onParamsChange is a
  // new function: on Back, Next re-renders with a new one before the
  // popstate listener below has read the address, and re-writing the
  // still-open view's `?davening=1` then undid the Back (found Oct 6).
  const minyanimViewSyncedOnce = useRef(false)
  // Set when the page itself opens the view (showMinyanimView, below).
  const openedHere = useRef(false)
  const writeMinyanimView = useEffectEvent((on: boolean) => {
    const step = on && openedHere.current
    openedHere.current = false
    onParamsChange?.(on ? { davening: '1' } : { davening: null, day: null }, step ? { step: MINYANIM_STEP } : { replace: true })
  })
  useEffect(() => {
    if (!minyanimViewSyncedOnce.current) {
      minyanimViewSyncedOnce.current = true
      return
    }
    writeMinyanimView(minyanimViewOn)
  }, [minyanimViewOn])
  // Opened from the page, the view is a step Back undoes (Oct 6): the
  // browser's, and on a phone a swipe. It used to replace the address, so
  // Back left Synagogues altogether. Its own ways back (the header's ‹ on a
  // phone, the switch's first half anywhere) take that same step when there
  // is one, so Forward doesn't reopen it; arriving on `?davening=1`, there's
  // none, and they just close it.
  const showMinyanimView = () => {
    openedHere.current = true
    setMinyanimViewOn(true)
  }
  const closeMinyanimView = () => {
    if ((window.history.state as { step?: string } | null)?.step === MINYANIM_STEP) window.history.back()
    else setMinyanimViewOn(false)
  }
  return { minyanimViewOn, setMinyanimViewOn, showMinyanimView, closeMinyanimView }
}
