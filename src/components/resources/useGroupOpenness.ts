import { useCallback, useState } from 'react'
import type { DirectoryResource } from '@/types'
import type { ListGroup } from '@/lib/listGroups'
import { usePersistedState } from '@/lib/usePersistedState'

// Which of a grouped list's groups are open (see listGroups.ts), moved out
// of GenericDirectory whole.
export function useGroupOpenness({
  communitySlug,
  categoryId,
  openNow,
  boolFilters,
  selectFilters,
  reopenItemId,
  activeFilterCount,
}: {
  communitySlug: string | null | undefined
  categoryId: string
  openNow: boolean
  boolFilters: Record<string, boolean>
  selectFilters: Record<string, string[]>
  reopenItemId: string | null | undefined
  activeFilterCount: number
}) {
  // Closed groups (a pick-list's, like denominations) start closed, and this
  // browser remembers which ones were opened.
  const openGroupsKey = `jpc:open-groups:${communitySlug ?? ''}:${categoryId}`
  const loadOpenGroups = () => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(openGroupsKey) ?? '[]')
      return Array.isArray(stored) ? stored.filter((v): v is string => typeof v === 'string') : []
    } catch {
      return []
    }
  }
  const saveOpenGroups = useCallback(
    (ids: string[]) => {
      try {
        localStorage.setItem(openGroupsKey, JSON.stringify(ids))
      } catch {
        // Private windows and blocked storage: the groups just start closed.
      }
    },
    [openGroupsKey],
  )
  const [openGroupIds, setOpenGroupIds] = usePersistedState<string[]>([], loadOpenGroups, saveOpenGroups)
  // While a filter is on, every group with a match opens (those without are
  // gone), and one closed then is closed only for as long as those filters
  // stay as they are; it isn't remembered.
  const filtersKey = JSON.stringify([openNow, boolFilters, selectFilters])
  const [closedWhileFiltered, setClosedWhileFiltered] = useState<{ key: string; ids: string[] }>({ key: '', ids: [] })
  const closedNow = closedWhileFiltered.key === filtersKey ? closedWhileFiltered.ids : []
  // A listing arriving open (?item=, a shared link or a reload) opens its
  // group, until that listing is closed.
  const [reopenClosedId, setReopenClosedId] = useState<string | null>(null)
  // A shul opened from the Next minyan card, or a place whose pin was
  // clicked, opens its group the same way.
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const isGroupOpen = (g: ListGroup<DirectoryResource>) =>
    (!!reopenItemId && reopenItemId !== reopenClosedId && g.items.some((i) => i.id === reopenItemId)) ||
    (!!revealedId && g.items.some((i) => i.id === revealedId)) ||
    (activeFilterCount > 0 ? !closedNow.includes(g.id) : openGroupIds.includes(g.id))
  // From what the group shows, not what's remembered: a group held open by
  // a listing (one just read, found from its pin, arrived by a link) used to
  // flip its remembered state underneath and stay open, so after reading a
  // shul and coming back its group couldn't be closed (the user, Oct 11).
  // Closing it lets go of whatever held it.
  const toggleGroup = (g: ListGroup<DirectoryResource>) => {
    const open = isGroupOpen(g)
    if (open) {
      if (revealedId && g.items.some((i) => i.id === revealedId)) setRevealedId(null)
      if (reopenItemId && g.items.some((i) => i.id === reopenItemId)) setReopenClosedId(reopenItemId)
    }
    const set = (ids: string[], on: boolean) => (on ? (ids.includes(g.id) ? ids : [...ids, g.id]) : ids.filter((x) => x !== g.id))
    // While a filter is on the list says which are closed; otherwise which are open.
    if (activeFilterCount > 0) setClosedWhileFiltered({ key: filtersKey, ids: set(closedNow, open) })
    else setOpenGroupIds((ids) => set(ids, !open))
  }
  return { revealedId, setRevealedId, setReopenClosedId, isGroupOpen, toggleGroup }
}
