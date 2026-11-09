'use client'

// Loads backGuard.ts on every page, before anything mounts, so its Back
// listener is added ahead of the router's (see that file). Draws nothing.
import '@/lib/backGuard'

export default function BackGuardFirst() {
  return null
}
