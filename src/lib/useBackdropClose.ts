'use client'

import { useRef } from 'react'
import type React from 'react'

/** A dialog's backdrop: a tap on it closes the dialog; a press inside the
 *  dialog let go outside it doesn't. Selecting text and letting go past the
 *  dialog's edge is that press, and the browser reports it as a click on
 *  the backdrop (found Oct 10, while fixing the user's note 11 about
 *  selecting text in the box). */
export function useBackdropClose(onClose: () => void) {
  const pressedOutside = useRef(false)
  return {
    onPointerDown: (e: React.PointerEvent) => {
      pressedOutside.current = e.target === e.currentTarget
    },
    onClick: (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && pressedOutside.current) onClose()
    },
  }
}
