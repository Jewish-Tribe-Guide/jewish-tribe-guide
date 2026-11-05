// The click a press outside an open menu goes on to make, swallowed so
// tapping away only closes the menu.
//
// The swallow used to end on the next tick after the finger lifted. On a
// real iPhone the click comes later than that (Nov 5: tapping away from an
// open filter still opened the row under it), so it now waits for the
// click, up to CLICK_AFTER_RELEASE_MS after the lift. A press that turns
// into a scroll has no click, and ends it at once.

export const CLICK_AFTER_RELEASE_MS = 600

export function swallowClickAfterPress(): void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const swallow = (c: MouseEvent) => {
    c.preventDefault()
    c.stopPropagation()
    stop()
  }
  const lifted = () => {
    timer = setTimeout(stop, CLICK_AFTER_RELEASE_MS)
  }
  const stop = () => {
    clearTimeout(timer)
    document.removeEventListener('click', swallow, true)
    document.removeEventListener('pointerup', lifted, true)
    document.removeEventListener('pointercancel', stop, true)
  }
  document.addEventListener('click', swallow, true)
  document.addEventListener('pointerup', lifted, { capture: true, once: true })
  document.addEventListener('pointercancel', stop, { capture: true, once: true })
}
