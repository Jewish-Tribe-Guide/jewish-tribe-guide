/** The nearest ancestor that scrolls, i.e. the parent's scroll region: a
 *  sheet's or a dialog's body. Null where the page itself scrolls. */
export function scrollingAncestor(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
  }
  return null
}
