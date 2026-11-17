'use client'

// Loads backGuard.ts and cameBack.ts on every page, before anything mounts, so their Back
// listeners are added ahead of the router's (see that file). Draws nothing.
import '@/lib/backGuard'
import '@/lib/cameBack'

export default function BackGuardFirst() {
  return null
}
