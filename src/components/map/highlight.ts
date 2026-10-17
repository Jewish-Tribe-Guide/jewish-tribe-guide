/** Which row the pointer is on, shared between a list and its map without
 *  re-rendering the list: moving across rows would otherwise redraw every
 *  row on the page, just to enlarge one pin. A category page's list and its
 *  map (CategoryMap), and the Map page's sidebar and its map. */
export type Highlight = {
  get: () => string | null
  set: (id: string | null) => void
  subscribe: (onChange: () => void) => () => void
}

export function createHighlight(): Highlight {
  let current: string | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set: (id) => {
      if (id === current) return
      current = id
      listeners.forEach((l) => l())
    },
    subscribe: (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
  }
}
