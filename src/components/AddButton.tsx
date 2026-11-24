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

/** The floating "+ Add", bottom right: the site's own one and each category
 *  page's. Apricot, the one colour on the site that means "you can add here"
 *  (drawn Oct 26, boards N and O), so it stands out from the blue of
 *  everything else you tap. A deeper apricot edge holds its shape against
 *  the white rows: 1px on the phone, 1.5px on desktop. Smaller on the phone, now the colour does the work; the word
 *  shows there too.
 *
 *  On a phone it goes while you scroll down and comes back as you scroll
 *  up, with the header (useScrollShowHide), and at the end of the page,
 *  where nothing is under it. It sat over half a tile in the home's
 *  right-hand column, and a tap there opened Add (the user, Nov 24: "Hide
 *  while scrolling"). A computer keeps it. */
export function AddButton({ onClick, label = 'Add' }: { onClick: () => void; label?: string }) {
  const phone = useMeasuredIsMobile() === true
  const shown = useScrollShowHide(phone)
  const atEnd = useAtPageEnd(phone)
  const hidden = phone && !shown && !atEnd
  return (
    <button
      type="button"
      onClick={onClick}
      // "Add", never "Add {category}": an empty category's own button
      // already says that, and both are on screen at once. aria-label wins
      // for the accessible name whatever the visible text grows into. Admin's
      // Places says what it adds, for a screen reader.
      aria-label={label}
      data-hidden={hidden || undefined}
      className={`fixed right-4 bottom-[calc(3.75rem+env(safe-area-inset-bottom)+1rem)] desktop:bottom-6 z-40 flex h-12 desktop:h-14 items-center justify-center gap-1.5 desktop:gap-2 rounded-full border desktop:border-[1.5px] border-add-edge bg-add pl-3.5 pr-[1.125rem] desktop:pl-[1.125rem] desktop:pr-[1.375rem] text-ink text-[0.9375rem] desktop:text-[1.0625rem] font-semibold shadow-[0_4px_12px_rgba(19,36,58,0.14)] desktop:shadow-[0_6px_16px_rgba(19,36,58,0.14)] cursor-pointer active:scale-95 transition-[translate,scale,opacity,visibility] duration-200 motion-reduce:transition-none ${hidden ? 'invisible translate-y-4 opacity-0' : ''}`}
    >
      <PlusIcon className="h-5 w-5 desktop:h-[22px] desktop:w-[22px] shrink-0" />
      <span className="whitespace-nowrap">Add</span>
    </button>
  )
}
