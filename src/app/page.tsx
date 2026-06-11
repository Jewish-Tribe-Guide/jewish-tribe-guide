'use client'

import { useState, useEffect } from 'react'
import type { AppMode, DirectoryAnchor, NavigateFn } from '@/types'
import Landing from '@/components/Landing'
import SiteHeader from '@/components/SiteHeader'
import FindResources from '@/components/FindResources'
import SupportWizard from '@/components/wizard/SupportWizard'
import VolunteerWizard from '@/components/wizard/VolunteerWizard'

// Which guided form is open as a full-screen overlay (Support / Volunteer), and
// any need pre-checked from the card or a search result.
export type Flow = { kind: 'support' | 'volunteer'; preselect?: string[] }

// What we persist in the browser history stack so back/forward can restore state.
type NavState = { mode: AppMode; flow?: Flow }

export default function Page() {
  const [mode, setMode] = useState<AppMode>('home')
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  // The guided Support/Volunteer form, shown as an overlay over the CURRENT page.
  const [flow, setFlow] = useState<Flow | null>(null)

  // The address anchor, editable from the header's location pill on every screen
  // — it drives all proximity sorting in the directory.
  const locationControls = {
    address,
    onAddressChange: setAddress,
    onCoords: setCoords,
  }

  // ── History API — keeps browser back/forward in sync with React state ──────
  useEffect(() => {
    // Do NOT call replaceState here. Next.js App Router stamps the initial entry
    // with __NA:true; overwriting it before that stamp lands strips __NA and causes
    // its popstate handler to call window.location.reload() on every history.back().
    function onPopState(e: PopStateEvent) {
      const s = e.state as NavState | null
      setMode(s?.mode ?? 'home')
      setFlow(s?.flow ?? null)
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Central navigation function — always call this instead of setMode directly so
  // every transition is recorded in the browser history stack. The first arg is
  // the legacy audience key (unused now that there's a single path) — kept so the
  // shared NavigateFn signature and search-index destinations keep compiling.
  const navigate: NavigateFn = (_audience, nextMode, extra) => {
    setMode(nextMode)
    setFlow(null)
    history.pushState({ mode: nextMode, ...extra } as NavState, '')
  }

  // Open a guided form over the current page. Pushes a history entry so the
  // browser Back button (and the wizard's ✕, which calls history.back()) closes
  // it and lands exactly where the visitor was.
  function openFlow(kind: Flow['kind'], preselect?: string[]) {
    const f: Flow = { kind, preselect }
    setFlow(f)
    history.pushState({ ...(window.history.state ?? {}), flow: f }, '')
  }

  // Title click — always a way back to the landing page.
  function goToLanding() {
    navigate(null, 'home')
  }

  const overlay = flow && (
    flow.kind === 'support' ? (
      <SupportWizard preselect={flow.preselect} onClose={() => history.back()} />
    ) : (
      <VolunteerWizard preselect={flow.preselect} onClose={() => history.back()} />
    )
  )

  // ── Landing — the single home screen (search + one card grid) ──────────────
  if (mode === 'home' || mode === 'community-home') {
    return (
      <>
        <SiteHeader onGoHome={goToLanding} location={locationControls} />
        <Landing onNavigate={navigate} onOpenFlow={openFlow} />
        {overlay}
      </>
    )
  }

  // ── Inner screens (directory) ───────────────────────────────────────────────
  // Everything anchors on the visitor's typed address now (the hospital picker
  // was retired from the location pill).
  const anchor: DirectoryAnchor = { kind: 'address', coords, label: address }

  // Up buttons lead back to the single home screen.
  const goToHome = () => navigate(null, 'home')

  return (
    <>
      <SiteHeader onGoHome={goToLanding} location={locationControls} />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {mode === 'find' && <FindResources anchor={anchor} onUp={goToHome} />}
      </main>
      {overlay}
    </>
  )
}
