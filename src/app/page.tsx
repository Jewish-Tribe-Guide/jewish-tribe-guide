'use client'

import { useState, useEffect } from 'react'
import type { AppMode, DirectoryAnchor, NavigateFn } from '@/types'
import Landing from '@/components/Landing'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import FindResources from '@/components/FindResources'
import SupportWizard from '@/components/wizard/SupportWizard'
import VolunteerWizard from '@/components/wizard/VolunteerWizard'

// Which guided form is open as a full-screen overlay (Support / Volunteer), and
// any need pre-checked from the card or a search result.
export type Flow = { kind: 'support' | 'volunteer'; preselect?: string[] }

// What we persist in the browser history stack so back/forward can restore state.
// `flowStep` is the wizard's current step index — each step is its own history
// entry, so browser Back/forward (and the swipe gesture) move between steps
// instead of discarding the whole form. The Wizard maintains it; page.tsx only
// reads it (to know how far to unwind on a full close).
type NavState = { mode: AppMode; flow?: Flow; flowStep?: number }

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

  // On a full page reload the browser keeps the current entry's history.state, so
  // restore whatever screen the visitor was on (a category, the hospitals list,
  // an open form) instead of snapping back to the landing page. Runs once after
  // mount — initializing state from history.state directly would mismatch the
  // server-rendered (always-home) markup during hydration.
  useEffect(() => {
    const s = window.history.state as NavState | null
    if (s?.mode && s.mode !== 'home') setMode(s.mode)
    if (s?.flow) setFlow(s.flow)
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

  // Open a guided form over the current page. Pushes the base flow entry
  // (flowStep 0); the Wizard pushes one more entry per step it advances, so the
  // browser Back button walks back through the steps and only closes the form
  // once the visitor backs out of step 0.
  function openFlow(kind: Flow['kind'], preselect?: string[]) {
    const f: Flow = { kind, preselect }
    setFlow(f)
    history.pushState({ ...(window.history.state ?? {}), flow: f, flowStep: 0 }, '')
  }

  // Fully close the wizard from any step (its ✕ / Esc / success "Done"). Each
  // step is a history entry, so we pop the current step plus every entry down to
  // and including the base flow entry — landing exactly on the page the visitor
  // opened the form from, where popstate sees no `flow` and unmounts the overlay.
  function closeFlow() {
    const step = (window.history.state as NavState | null)?.flowStep ?? 0
    history.go(-(step + 1))
  }

  // Title click — always a way back to the landing page.
  function goToLanding() {
    navigate(null, 'home')
  }

  const overlay = flow && (
    flow.kind === 'support' ? (
      <SupportWizard preselect={flow.preselect} onClose={closeFlow} />
    ) : (
      <VolunteerWizard preselect={flow.preselect} onClose={closeFlow} />
    )
  )

  // ── Landing — the single home screen (search + one card grid) ──────────────
  if (mode === 'home' || mode === 'community-home') {
    return (
      <>
        <SiteHeader onGoHome={goToLanding} location={locationControls} />
        <div className="flex-1">
          <Landing onNavigate={navigate} onOpenFlow={openFlow} />
        </div>
        <SiteFooter />
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
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-8">
        {mode === 'find' && <FindResources anchor={anchor} onUp={goToHome} />}
      </main>
      <SiteFooter />
      {overlay}
    </>
  )
}
