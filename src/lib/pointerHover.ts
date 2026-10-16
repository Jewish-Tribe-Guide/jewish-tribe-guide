import type { MouseEvent } from 'react'

/**
 * A list row's hover, for lifting its pin on the map beside it: when the
 * pointer moves onto the row, not when scrolling the list slides a row under
 * a pointer that's standing still (the user, Oct 16: pins popped up all down
 * the list while scrolling it).
 *
 * Scrolling under a still pointer tells the page it's over each row in turn
 * — a mouseenter, and in Chrome a mousemove that didn't move (movementX and
 * movementY both 0). Only a move that moved counts. Leaving still lets go,
 * whether the row was moved off or scrolled away.
 */
export function pointerHover(on: () => void, off: () => void) {
  return {
    onMouseMove: (e: MouseEvent) => {
      if (e.movementX === 0 && e.movementY === 0) return
      on()
    },
    onMouseLeave: off,
  }
}
