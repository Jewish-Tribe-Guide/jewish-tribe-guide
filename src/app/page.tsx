'use client'

import { useState, useEffect } from 'react'
import { hospitals } from '@/data/hospitals'
import type { AppMode, Audience, DirectoryAnchor } from '@/types'
import Landing from '@/components/Landing'
import SiteHeader from '@/components/SiteHeader'
import Home from '@/components/Home'
import CommunityHome from '@/components/CommunityHome'
import FindResources from '@/components/FindResources'
import GetAssistance from '@/components/GetAssistance'
import Volunteer from '@/components/Volunteer'

// What we persist in the browser history stack so back/forward can restore state.
type NavState = { audience: Audience | null; mode: AppMode }

export default function Page() {
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>(hospitals[0].id)
  const [audience, setAudience] = useState<Audience | null>(null)
  const [mode, setMode] = useState<AppMode>('home')
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

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
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Central navigation function — always call this instead of setMode/setAudience
  // directly so every transition is recorded in the browser history stack.
  function navigate(nextAudience: Audience | null, nextMode: AppMode) {
    setAudience(nextAudience)
    setMode(nextMode)
    history.pushState({ audience: nextAudience, mode: nextMode } as NavState, '')
  }

  // Audience fork (Landing cards or header switch).
  // Preserve the current mode when switching if that mode exists on the other
  // side (e.g. 'find' is shared). Otherwise, reset to the side's home screen.
  function goToAudience(next: Audience) {
    const sharedModes: AppMode[] = ['find']
    const defaultMode: AppMode = next === 'patient' ? 'home' : 'community-home'
    navigate(next, sharedModes.includes(mode) ? mode : defaultMode)
  }

  // Title click — always a way back to the "who are you?" landing screen.
  function goToLanding() {
    navigate(null, 'home')
  }

  // Mode change within the current audience.
  function goToMode(newMode: AppMode) {
    navigate(audience, newMode)
  }

  if (audience === null) {
    return <Landing onChoose={goToAudience} />
  }

  const anchor: DirectoryAnchor =
    audience === 'patient'
      ? { kind: 'hospital', hospitalId: selectedHospitalId, hospitalName: selectedHospitalName }
      : { kind: 'address', coords, label: address }

  return (
    <>
      <SiteHeader
        audience={audience}
        onSwitchAudience={goToAudience}
        onGoHome={goToLanding}
        hospitals={hospitals}
        selectedHospitalId={selectedHospitalId}
        onHospitalChange={setSelectedHospitalId}
        address={address}
        onAddressChange={setAddress}
        onCoords={setCoords}
      />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {audience === 'patient' ? (
          <>
            {mode === 'home' && <Home hospitalName={selectedHospitalName} onNavigate={goToMode} onBack={() => history.back()} />}
            {mode === 'find' && <FindResources anchor={anchor} onBack={() => history.back()} />}
            {mode === 'assist' && (
              <GetAssistance
                hospitalId={selectedHospitalId}
                hospitalName={selectedHospitalName}
                onBack={() => history.back()}
              />
            )}
            {mode === 'volunteer' && <Volunteer onBack={() => history.back()} />}
          </>
        ) : (
          <>
            {mode === 'community-home' && (
              <CommunityHome addressLabel={address} onNavigate={goToMode} onBack={() => history.back()} />
            )}
            {mode === 'find' && (
              <FindResources anchor={anchor} onBack={() => history.back()} />
            )}
            {mode === 'give' && <Volunteer onBack={() => history.back()} />}
          </>
        )}
      </main>
    </>
  )
}
