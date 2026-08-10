// Pure logic for "dropped" pins — an arbitrary point a visitor marks on the
// map that isn't tied to any listing ("where I parked", "my hotel"), saved
// to this browser only. Same shape of module as pinned.ts (parse/validate,
// add/remove, a soft cap), kept separate because a dropped pin isn't a
// listing reference — it's its own coordinate and a label the visitor typed.

export type DroppedPin = {
  id: string
  lat: number
  lng: number
  label: string
}

const STORAGE_KEY = 'jpc:dropped-pins'

// Same reasoning as MAX_PINS in pinned.ts — a soft ceiling on a personal,
// hand-placed set of markers, not a real limit anyone should ever bump into.
const MAX_DROPPED_PINS = 50

function isDroppedPin(value: unknown): value is DroppedPin {
  if (!value || typeof value !== 'object') return false
  const p = value as DroppedPin
  return typeof p.id === 'string' && typeof p.lat === 'number' && typeof p.lng === 'number' && typeof p.label === 'string'
}

/** Parses a raw localStorage string into a valid dropped-pin list — see the
 *  identical split in pinned.ts's parsePinned for why this is separate from
 *  the localStorage read itself (testable without a DOM). */
export function parseDroppedPins(raw: string | null): DroppedPin[] {
  try {
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isDroppedPin)
  } catch {
    return []
  }
}

export function loadDroppedPins(): DroppedPin[] {
  return parseDroppedPins(localStorage.getItem(STORAGE_KEY))
}

export function saveDroppedPins(pins: DroppedPin[]): void {
  try {
    if (pins.length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(pins))
  } catch {
    // Storage unavailable — best-effort, same as everywhere else this app
    // touches localStorage.
  }
}

/** Adds a new dropped pin, dropping the oldest one first if already at the
 *  cap — never mutates `pins`. */
export function addDroppedPin(pins: DroppedPin[], pin: DroppedPin): DroppedPin[] {
  const withRoom = pins.length >= MAX_DROPPED_PINS ? pins.slice(1) : pins
  return [...withRoom, pin]
}

export function removeDroppedPin(pins: DroppedPin[], id: string): DroppedPin[] {
  return pins.filter((p) => p.id !== id)
}

export function renameDroppedPin(pins: DroppedPin[], id: string, label: string): DroppedPin[] {
  return pins.map((p) => (p.id === id ? { ...p, label } : p))
}
