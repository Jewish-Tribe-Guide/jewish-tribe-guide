import { useEffect, useRef, useState } from 'react'

// Distance first, always (the user, Oct 15): with no location set, the
// miles from the community's centre that every row already shows, which
// the top of the page says it's measuring from. Popular only where there
// is no distance at all to sort by (a category without addresses, e.g.
// WhatsApp groups), until the visitor makes an explicit choice (selectSort
// in GenericDirectory), which then sticks regardless of what the anchor
// does afterward.
//
// Deliberately not a one-time lazy initializer. A saved address (or live
// tracking resuming) restores from localStorage in a POST-MOUNT effect —
// see useStoredLocation — so anchorLabel is still empty on the page's
// very first render even for a returning visitor who already has a
// location saved. This effect re-derives the default every time what
// there is to measure from changes instead.
//
// Moved out of GenericDirectory whole.
export function useSortChoice(canSortByDistance: boolean) {
  const [sortByPopular, setSortByPopular] = useState(!canSortByDistance)
  const touchedSortRef = useRef(false)
  useEffect(() => {
    if (touchedSortRef.current) return
    setSortByPopular(!canSortByDistance)
  }, [canSortByDistance])
  return { sortByPopular, setSortByPopular, touchedSortRef }
}
