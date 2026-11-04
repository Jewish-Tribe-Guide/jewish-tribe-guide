// Putting a list in order by dragging (the user, Nov 4: "Could this be drag
// instead of arrows?"; drawing KdHT8Tci1ufXSXobnnSfEm). The arithmetic the
// drag list (components/admin/DragList.tsx) runs on. Pure.

/** The list with the item at `from` moved to `to`. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return [...list]
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item)
  return next
}

/** Where a dragged row lands: the number of the other rows whose middle is
 *  above its middle. `middles` are the other rows', in order. */
export function dropIndex(middles: readonly number[], draggedMiddle: number): number {
  return middles.filter((m) => m < draggedMiddle).length
}
