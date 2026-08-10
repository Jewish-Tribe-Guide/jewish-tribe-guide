'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  addDroppedPin,
  loadDroppedPins,
  removeDroppedPin,
  renameDroppedPin,
  saveDroppedPins,
  type DroppedPin,
} from './droppedPins'

// The visitor's own hand-placed map pins ("where I parked") — same
// localStorage-backed provider pattern as pinnedContext.tsx, kept as its own
// context rather than folded into that one because a dropped pin isn't a
// listing reference; it's arbitrary coordinates plus a label, with its own
// add/remove/rename operations.

type DroppedPinsContextValue = {
  droppedPins: DroppedPin[]
  add: (pin: DroppedPin) => void
  remove: (id: string) => void
  rename: (id: string, label: string) => void
}

const DroppedPinsContext = createContext<DroppedPinsContextValue | null>(null)

export function DroppedPinsProvider({ children }: { children: React.ReactNode }) {
  const [droppedPins, setDroppedPins] = useState<DroppedPin[]>([])
  const hydrated = useRef(false)

  useEffect(() => {
    setDroppedPins(loadDroppedPins())
    hydrated.current = true
  }, [])

  useEffect(() => {
    if (!hydrated.current) return
    saveDroppedPins(droppedPins)
  }, [droppedPins])

  const value = useMemo<DroppedPinsContextValue>(
    () => ({
      droppedPins,
      add: (pin: DroppedPin) => setDroppedPins((prev) => addDroppedPin(prev, pin)),
      remove: (id: string) => setDroppedPins((prev) => removeDroppedPin(prev, id)),
      rename: (id: string, label: string) => setDroppedPins((prev) => renameDroppedPin(prev, id, label)),
    }),
    [droppedPins],
  )

  return <DroppedPinsContext.Provider value={value}>{children}</DroppedPinsContext.Provider>
}

export function useDroppedPins(): DroppedPinsContextValue {
  const ctx = useContext(DroppedPinsContext)
  if (!ctx) throw new Error('useDroppedPins must be used inside a DroppedPinsProvider')
  return ctx
}
