// Waits for an element's position to stop moving, then calls `onSettled`
// (GenericDirectory's scroll to a row, after a re-sort lands). Polls every
// `interval` ms rather than guessing a delay; setTimeout, not
// requestAnimationFrame, which is paused while the tab is in the
// background.
//
// It gives up after `maxTries`. Before (Nov 19) it had no end: a row that
// never appeared — the list unmounted, the listing filtered out — kept a
// 32ms timer going for as long as the page stayed open, and one firing
// after a test's page was torn down failed CI with "window is not defined".

export type SettleOptions = { interval?: number; maxTries?: number; stableChecks?: number }

/** Returns a cancel. */
export function whenSettled(
  getEl: () => Element | null | undefined,
  onSettled: () => void,
  { interval = 32, maxTries = 100, stableChecks: needed = 2 }: SettleOptions = {},
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let tries = 0
  let lastTop: number | null = null
  let stable = 0
  const check = () => {
    timer = undefined
    tries++
    const el = getEl()
    if (el) {
      const top = el.getBoundingClientRect().top
      stable = lastTop !== null && Math.abs(top - lastTop) < 0.5 ? stable + 1 : 0
      lastTop = top
      if (stable >= needed) {
        onSettled()
        return
      }
    }
    if (tries < maxTries) timer = setTimeout(check, interval)
  }
  timer = setTimeout(check, interval)
  return () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
}
