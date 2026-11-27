'use client'

import { useEffect, useState } from 'react'
import { PlusIcon } from '@/components/icons'
import { useScrollShowHide } from '@/lib/headerVisibility'
import { useMeasuredIsMobile } from '@/lib/useIsMobile'

/** Within this many pixels of the end of the page counts as the end. */
const END_SLACK = 24

/** Whether the page is scrolled to its end (or too short to scroll). */
export function atPageEnd(y: number, viewport: number, page: number, slack = END_SLACK): boolean {
  return y + viewport >= page - slack
}

function useAtPageEnd(enabled: boolean): boolean {
  const [atEnd, setAtEnd] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const check = () => setAtEnd(atPageEnd(window.scrollY, window.innerHeight, document.documentElement.scrollHeight))
    check()
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    return () => {
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [enabled])
  return atEnd
}

/** The floating "+", bottom right, on a phone: the site's own one and each
 *  category page's (Nov 27, board U1c). A round button in the community's
 *  blue with a white +, the colour of every Send, so it reads as the main
 *  thing you can do (Gmail's Compose, Google Maps' +); the words are the
 *  sheet's title, "Add or update", and the button's name. It was apricot,
 *  the one "you can add here" colour, from Oct 26 (boards N and O).
 *
 *  A computer has no floating button: "+ Add or update" is in the header
 *  (HeaderAddButton, board D1b), so `phoneOnly` hides this one there. Admin's
 *  Places keeps it on a computer too, as a pill with its word, since the
 *  admin console has no site header.
 *
 *  On a phone it goes while you scroll down and comes back as you scroll
 *  up, with the header (useScrollShowHide), and at the end of the page,
 *  where nothing is under it. It sat over half a tile in the home's
 *  right-hand column, and a tap there opened Add (the user, Nov 24: "Hide
 *  while scrolling"). */
export function AddButton({ onClick, label = 'Add or update', phoneOnly = false }: { onClick: () => void; label?: string; phoneOnly?: boolean }) {
  const phone = useMeasuredIsMobile() === true
  const shown = useScrollShowHide(phone)
  const atEnd = useAtPageEnd(phone)
  const hidden = phone && !shown && !atEnd
  return (
    <button
      type="button"
      onClick={onClick}
      // aria-label wins for the accessible name: the phone's button is the
      // + alone. Admin's Places says what it adds.
      aria-label={label}
      data-hidden={hidden || undefined}
      className={`fixed right-4 bottom-[calc(3.75rem+env(safe-area-inset-bottom)+1rem)] desktop:bottom-6 z-40 ${phoneOnly ? 'flex desktop:hidden' : 'flex'} h-14 w-14 desktop:w-auto items-center justify-center desktop:gap-2 rounded-full bg-primary desktop:pl-[1.125rem] desktop:pr-[1.375rem] text-white desktop:text-[1.0625rem] font-semibold shadow-[0_4px_12px_rgba(29,78,216,0.35)] hover:bg-primary-dark cursor-pointer active:scale-95 transition-[translate,scale,opacity,visibility] duration-200 motion-reduce:transition-none ${hidden ? 'invisible translate-y-4 opacity-0' : ''}`}
    >
      <PlusIcon className="h-[26px] w-[26px] desktop:h-[22px] desktop:w-[22px] shrink-0" />
      <span className="hidden whitespace-nowrap desktop:inline">Add</span>
    </button>
  )
}
