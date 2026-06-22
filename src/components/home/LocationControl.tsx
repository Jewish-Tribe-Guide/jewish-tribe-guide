'use client'

import { useEffect, useRef, useState } from 'react'
import AddressInput from '@/components/intake/AddressInput'

export type LocationControls = {
  address: string
  onAddressChange: (address: string) => void
  onCoords: (coords: { lat: number; lng: number } | null) => void
}

type Props = {
  controls: LocationControls
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 21c-4.4-3.9-7-7.4-7-10.8A7 7 0 0 1 12 3a7 7 0 0 1 7 7.2c0 3.4-2.6 6.9-7 10.8z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  )
}

// Header pill that anchors all distance sorting: the visitor types an address or
// taps "use my current location", which powers the directory's proximity sorting.
export default function LocationControl({ controls }: Props) {
  const [open, setOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Close when clicking anywhere outside the popover.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Allow any component (e.g. AddressPrompt) to open the picker without prop drilling.
  useEffect(() => {
    function onOpen() { setOpen(true) }
    document.addEventListener('jpc:open-location', onOpen)
    return () => document.removeEventListener('jpc:open-location', onOpen)
  }, [])

  const label = controls.address || 'Set location'

  // Picking a real address yields coordinates — apply them and close (no Done
  // button needed). Free typing passes null coords, so the popover stays open.
  const handleCoords = (coords: { lat: number; lng: number } | null) => {
    controls.onCoords(coords)
    if (coords) setOpen(false)
  }

  const useCurrentLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('Location isn’t available on this device.')
      return
    }
    setLocating(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        controls.onCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        controls.onAddressChange('Current location')
        setLocating(false)
        setOpen(false)
      },
      (err) => {
        setLocating(false)
        // Surface the actual failure: a denied permission and a hardware/timeout
        // failure need different fixes, so a single generic message hides the cause.
        console.warn('[geolocation] error', err.code, err.message)
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError('Location permission is blocked. Allow location for this site in your browser settings (and check iOS Settings → Privacy → Location Services → Safari), then try again — or type an address below.')
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGeoError('Your location is currently unavailable. Please type an address below.')
        } else if (err.code === err.TIMEOUT) {
          setGeoError('Locating timed out. Try again, or type an address below.')
        } else {
          setGeoError('Couldn’t get your location. Please type an address below.')
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex max-w-[220px] items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1.5 pl-2.5 pr-3 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:bg-slate-50 cursor-pointer"
      >
        <PinIcon className="h-4 w-4 shrink-0 text-primary" />
        {/* Show the "Set location" prompt on every size so first-time mobile
            visitors discover it; once an address is set, collapse to just the
            pin on mobile to save header space. */}
        <span className={`truncate ${controls.address ? 'hidden md:block' : 'block'}`}>{label}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[calc(100vw-2rem)] max-w-sm sm:w-80 rounded-2xl border border-slate-100 bg-white p-4 shadow-xl shadow-slate-900/10">
          <p className="text-sm font-semibold text-slate-900">
            Where should distances be measured from?
          </p>

          <button
            onClick={useCurrentLocation}
            disabled={locating}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 active:bg-primary/20 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
          >
            <PinIcon className="h-4 w-4 shrink-0" />
            {locating ? 'Locating…' : 'Use my current location'}
          </button>

          <div className="my-3 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-100" />
            or enter an address
            <span className="h-px flex-1 bg-slate-100" />
          </div>

          <AddressInput
            value={controls.address}
            onChange={controls.onAddressChange}
            onCoords={handleCoords}
            placeholder="Enter your address"
          />

          {geoError && <p className="mt-2 text-xs text-red-600">{geoError}</p>}
        </div>
      )}
    </div>
  )
}
