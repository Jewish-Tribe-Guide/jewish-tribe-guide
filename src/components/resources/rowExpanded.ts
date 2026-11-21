import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { DirectoryResource } from '@/types'
import { routes } from '@/lib/routes'
import { stepsIn } from '@/lib/stepAddress'
import { LISTING_STEP, type ParamsOpts } from './directoryAddress'

// A listing in a category's list opened or closed: what the address and
// the page remember of it (GenericDirectory's rows' onExpandedChange,
// moved out whole).
export function rowExpanded(
  item: DirectoryResource,
  expanded: boolean,
  {
    openCardIdsRef,
    isMobile,
    linkedItemId,
    activeCommunity,
    category,
    onParamsChange,
    hostedId,
    pagedItemId,
    reopenItemId,
    revealedId,
    setRevealedId,
    setClosedMatchFor,
    reopenKey,
    setReopenClosedId,
    setOpenDialogItemId,
  }: {
    openCardIdsRef: RefObject<Set<string>>
    isMobile: boolean
    linkedItemId: string | null
    activeCommunity: { slug: string }
    category: { id: string }
    onParamsChange?: (changes: Record<string, string | null>, opts?: ParamsOpts) => void
    hostedId: string | null
    pagedItemId: string | null
    reopenItemId: string | null | undefined
    revealedId: string | null
    setRevealedId: (id: string | null) => void
    setClosedMatchFor: (key: string | null) => void
    reopenKey: string | null
    setReopenClosedId: (id: string | null) => void
    setOpenDialogItemId: Dispatch<SetStateAction<string | null>>
  },
) {
  if (expanded) openCardIdsRef.current.add(item.id)
  else openCardIdsRef.current.delete(item.id)
  const address = new URLSearchParams(window.location.search)
  // A phone's sheet opened from the list is a step too (Nov
  // 18: Back left the page under it). Closed on the screen, it
  // takes that step back, so Forward doesn't reopen it. Closed
  // with its editor open, the editor's levels too (Nov 19):
  // they're entries (useEditorInAddress), and one step landed
  // on the listing's own, shut, the next Back doing nothing.
  const stepBack =
    !expanded &&
    isMobile &&
    address.get('item') === item.id &&
    (window.history.state as { step?: string } | null)?.step === LISTING_STEP
  const editorSteps = stepsIn(window.location.search, 'editing', item.id).length
  if (stepBack && editorSteps > 0) window.history.go(-(1 + editorSteps))
  else if (stepBack) window.history.back()
  // The listing's own link names it already: `?item=` on top
  // made a reload on a phone the list with a sheet (Nov 18).
  else if (!(expanded && item.id === linkedItemId && window.location.pathname !== routes.slug(activeCommunity.slug, category.id))) {
    onParamsChange?.(
      // Closed in place, its editor goes from the address
      // with it: left there, the next listing opened under
      // that name came up as its editor.
      { item: expanded ? item.id : null, ...(expanded ? {} : { match: null, ...(editorSteps > 0 ? { editing: null } : {}) }) },
      // Not when the address already names it: a link, or
      // Forward, reopening it. (On a phone arriving from its
      // link, the first render still thinks it's a computer.)
      expanded &&
      !hostedId &&
      item.id !== pagedItemId &&
      item.id !== reopenItemId &&
      item.id !== linkedItemId &&
      address.get('item') !== item.id
        ? { step: LISTING_STEP }
        : { replace: true },
    )
  }
  if (!expanded && item.id === revealedId) setRevealedId(null)
  if (!expanded && item.id === reopenItemId) {
    setClosedMatchFor(reopenKey)
    setReopenClosedId(item.id)
  }
  // See openDialogItemId's own note. Cleared by id rather
  // than unconditionally: arrow-key next/prev closes
  // one card and opens a sibling in the same commit, and the
  // closing card's callback can run after the opening one's,
  // which would otherwise clear the flag the new dialog just set.
  setOpenDialogItemId((prev) => (expanded ? item.id : prev === item.id ? null : prev))
}
