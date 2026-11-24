import { useEffect, useEffectEvent, useRef } from 'react'
import { useOptionalLocation } from '@/lib/locationContext'
import type { GenericListingCardHandle } from './GenericListingCard'

// The category page's listing cards, found by id: opening and closing them
// from outside (a reopened `?item=`, next and previous, a pin), and following
// a listing back into view when its "I'm here" re-sorts the list
// (GenericDirectory).

type Options = {
  reopenItemId: string | null | undefined
  scrollItemIntoViewWhenSettled: (id: string, behavior: ScrollBehavior) => () => void
}

export function useListingCards({ reopenItemId, scrollItemIntoViewWhenSettled }: Options) {
  // A fresh closure every render: read, not depended on, so only the ids
  // below re-run the effects.
  const scrollWhenSettled = useEffectEvent((id: string, behavior: ScrollBehavior) => scrollItemIntoViewWhenSettled(id, behavior))
  // Every rendered card's open/close handle, keyed by listing id — same
  // "callback ref in a Map, not an array" shape as itemRowRefs above, and
  // for the same reason (found by id, not position, after a re-sort).
  // Desktop-only in practice (see GenericListingCardHandle's own comment):
  // arrow-key next/prev needs to close ONE card and open a SIBLING it has
  // no other way to reach, since `expanded` is that card's own local state
  // rather than something lifted here.
  const cardRefs = useRef(new Map<string, GenericListingCardHandle>())
  const setCardRef = (id: string) => (handle: GenericListingCardHandle | null) => {
    if (handle) cardRefs.current.set(id, handle)
    else cardRefs.current.delete(id)
  }
  // Which cards have their listing open right now, kept by each card's
  // onExpandedChange (below). A ref, not state: the effect below reads it on
  // Activity's reveal, where a state value from an earlier render would be
  // exactly the stale answer this exists to avoid.
  const openCardIdsRef = useRef(new Set<string>())

  useEffect(() => {
    // A listing left open from an earlier visit closes first. Leaving a
    // category (browser Back to home) hides this screen under <Activity>
    // rather than unmounting it, so the card that was open stays open in
    // the hidden tree. Coming back with a different `?item=` then opened a
    // second dialog on top of the first — reported live on desktop: open a
    // listing, press Back, pick another from the home search, and both were
    // up, one over the other. Coming back with no `?item=` at all (the
    // Categories menu) showed the old one again. This effect re-runs on
    // Activity's reveal as well as on a new `?item=`, which covers both.
    // Only open cards are closed: close() clears `?item=` in the URL, so
    // calling it on every card would write the URL once per listing.
    for (const id of [...openCardIdsRef.current]) {
      if (id !== reopenItemId) cardRefs.current.get(id)?.close()
    }
    if (!reopenItemId) return
    // Actually opens the card too, not just scrolls to it — `defaultExpanded`
    // (below, on each card) only seeds that card's OWN expand state on ITS
    // OWN first mount, which does nothing if this directory is already
    // mounted from an earlier visit: Next's Cache Components keep a recent
    // route's component tree alive via <Activity> instead of unmounting it,
    // so navigating back into an already-open category with a NEW `?item=`
    // (e.g. a different listing picked from the home search dropdown) left
    // the URL pointing at the right listing but no modal actually open —
    // confirmed live, and only a full reload (a genuine fresh mount) fixed
    // it. Calling .open() on the genuine first-mount case (already true via
    // defaultExpanded) is a harmless no-op.
    cardRefs.current.get(reopenItemId)?.open()
    // Settle-aware, not a plain one-shot scrollItemIntoView — this list can
    // still reorder right after mount (distance sort landing once
    // geolocation resolves is the common case: a `?item=` deep link into a
    // distance-sorted category, opened before a location's ever been set).
    // A scroll measured before that reorder lands targets the row's
    // pre-reorder position, so the visitor ends up scrolled to wherever
    // that used to be — short of or past where the reopened listing
    // actually settled, off by however far the reorder moved it.
    return scrollWhenSettled(reopenItemId, 'instant')
  }, [reopenItemId])

  // Tapping a listing's "I'm here" (see SetLocationButton) re-anchors every
  // distance to it, which — for anyone not already on Distance sort — flips
  // the whole list to Distance and reorders it. On a long list, scrolled deep
  // in, that reorder happens entirely off-screen: the visitor is left looking
  // at whatever listing now occupies the spot they were scrolled to, with no
  // sign their tap did anything. This follows the tapped listing back into
  // view once the reorder actually lands.
  //
  // anchorListingId, not the whole anchor: a typed address or a GPS fix also
  // changes anchorLabel and re-sorts, but there's no single card to return
  // to for those — this is specifically the "I tapped a listing" case.
  const anchorListingId = useOptionalLocation()?.anchorListingId ?? null
  // Skips the very first commit, which is either the initial mount (nothing
  // to follow back to yet) or a returning visitor's already-stored anchor
  // restoring — neither should yank the page to a card the visitor didn't
  // just tap.
  const anchorSettledRef = useRef(false)
  useEffect(() => {
    if (!anchorSettledRef.current) {
      anchorSettledRef.current = true
      return
    }
    if (!anchorListingId) return
    // This commit is the anchor id changing — the sortByPopular effect above
    // (and every card's own distance-label recompute) hasn't reacted to the
    // new anchorLabel yet, so the tapped card's row is still at its OLD
    // position. A fixed delay isn't reliably enough: setting an anchor also
    // stops GPS tracking and touches several other contexts upstream (see
    // setListingAnchor), and their re-renders can land a tick or two apart —
    // scrollItemIntoViewWhenSettled polls instead of guessing one.
    return scrollWhenSettled(anchorListingId, 'smooth')
  }, [anchorListingId])
  return { cardRefs, setCardRef, openCardIdsRef }
}
