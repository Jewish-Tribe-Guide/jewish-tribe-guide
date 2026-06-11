'use client'

import { useState, useEffect } from 'react'
import { hospitals } from '@/data/hospitals'
import type { AppMode, Audience, DirectoryAnchor } from '@/types'
import type { AnchorControls } from '@/components/AnchorBar'
import Landing from '@/components/Landing'
import AudienceHome from '@/components/AudienceHome'
import SiteHeader from '@/components/SiteHeader'
import FindResources from '@/components/FindResources'
import IntakeForm from '@/components/intake/IntakeForm'
import ServiceModal from '@/components/home/ServiceModal'
import Volunteer from '@/components/Volunteer'

// What we persist in the browser history stack so back/forward can restore state.
type NavState = { audience: Audience | null; mode: AppMode; serviceModal?: string }

export default function Page() {
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>(hospitals[0].id)
  const [audience, setAudience] = useState<Audience | null>(null)
  const [mode, setMode] = useState<AppMode>('home')
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  // A service request form shown as an overlay on the CURRENT page (set by the
  // Direct Support cards and search suggestions — opening one never navigates).
  const [serviceModal, setServiceModal] = useState<string | null>(null)

  const selectedHospitalName = hospitals.find((h) => h.id === selectedHospitalId)?.name ?? ''

  // ── History API — keeps browser back/forward in sync with React state ──────
  useEffect(() => {
    // Do NOT call replaceState here. Next.js App Router stamps the initial entry
    // with __NA:true; overwriting it before that stamp lands strips __NA and causes
    // its popstate handler to call window.location.reload() on every history.back().
    // Our popstate handler already defaults audience/mode to null/'home' for entries
    // that lack those keys, so back-pressing past the first navigate() still shows
    // Landing correctly.
    function onPopState(e: PopStateEvent) {
      const s = e.state as NavState | null
      setAudience(s?.audience ?? null)
      setMode(s?.mode ?? 'home')
      setServiceModal(s?.serviceModal ?? null)
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Central navigation function — always call this instead of setMode/setAudience
  // directly so every transition is recorded in the browser history stack.
  // `extra` rides along in the history state so the target screen can restore a
  // sub-view on mount (assistView / findView / findQuery / volunteerView).
  function navigate(
    nextAudience: Audience | null,
    nextMode: AppMode,
    extra?: Record<string, unknown>,
  ) {
    setAudience(nextAudience)
    setMode(nextMode)
    setServiceModal(null)
    history.pushState({ audience: nextAudience, mode: nextMode, ...extra } as NavState, '')
  }

  // Open a service form over the current page. Pushes a history entry so the
  // browser Back button (and the modal's ✕, which calls history.back()) closes
  // it and lands exactly where the visitor was.
  function openService(service: string) {
    setServiceModal(service)
    history.pushState({ ...(window.history.state ?? {}), serviceModal: service }, '')
  }

  // Audience switch (the header tabs). 'find' works on both sides, so stay
  // there; anything else lands on that audience's home page.
  function goToAudience(next: Audience) {
    const defaultMode: AppMode = next === 'patient' ? 'home' : 'community-home'
    navigate(next, mode === 'find' && audience !== null ? 'find' : defaultMode)
  }

  // Title click — always a way back to the landing page.
  function goToLanding() {
    navigate(null, 'home')
  }

  const modal = serviceModal && (
    <ServiceModal
      service={serviceModal}
      hospitalId={selectedHospitalId}
      onClose={() => history.back()}
    />
  )

  // ── Landing + audience home pages (wide, card-based) ───────────────────────
  if (audience === null) {
    return (
      <>
        <SiteHeader audience={null} onSwitchAudience={goToAudience} onGoHome={goToLanding} />
        <Landing onNavigate={navigate} onOpenService={openService} />
        {modal}
      </>
    )
  }

  if (mode === 'home' || mode === 'community-home') {
    return (
      <>
        <SiteHeader audience={audience} onSwitchAudience={goToAudience} onGoHome={goToLanding} />
        <AudienceHome audience={audience} onNavigate={navigate} onOpenService={openService} />
        {modal}
      </>
    )
  }

  // ── Inner screens (directory, forms) ────────────────────────────────────────
  const anchor: DirectoryAnchor =
    audience === 'patient'
      ? { kind: 'hospital', hospitalId: selectedHospitalId, hospitalName: selectedHospitalName }
      : { kind: 'address', coords, label: address }

  const anchorControls: AnchorControls = {
    audience,
    hospitals,
    selectedHospitalId,
    onHospitalChange: setSelectedHospitalId,
    address,
    onAddressChange: setAddress,
    onCoords: setCoords,
  }

  // Up buttons lead to the visitor's audience home page, not all the way out
  // to the landing fork.
  const goToAudienceHome = () =>
    navigate(audience, audience === 'patient' ? 'home' : 'community-home')

  return (
    <>
      <SiteHeader
        audience={audience}
        onSwitchAudience={goToAudience}
        onGoHome={goToLanding}
      />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {mode === 'find' && (
          <FindResources anchor={anchor} anchorControls={anchorControls} onUp={goToAudienceHome} />
        )}
        {/* The four specific services open as modals over the current page, so
            'assist' goes straight to the full direct-support intake form. */}
        {mode === 'assist' && audience === 'patient' && (
          <IntakeForm
            hospitalId={selectedHospitalId}
            hospitalName={selectedHospitalName}
            onUp={goToAudienceHome}
          />
        )}
        {(mode === 'volunteer' || mode === 'give') && <Volunteer onUp={goToAudienceHome} />}
      </main>
      {modal}
    </>
  )
}
