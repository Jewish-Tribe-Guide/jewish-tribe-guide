'use client'

import { useEffect, useRef, useState } from 'react'
import AddressInput from '@/components/intake/AddressInput'
import { PinIcon } from '@/components/icons'

export type LocationControls = {
  address: string
  onAddressChange: (address: string) => void
  onCoords: (coords: { lat: number; lng: number } | null) => void
  /** Whether the site-wide live GPS watch is currently running (see
   *  useLiveLocation) — updating `address`/coords continuously as the visitor
   *  moves, the same watch the map page's "live tracking" uses. */
  tracking: boolean
  geoError: string | null
  onStartTracking: () => void
  onStopTracking: () => void
}

type Props = {
  controls: LocationControls
}

// Header pill that anchors all distance sorting: the visitor shares their live
// location or types an address, which powers the directory's proximity sorting.
export default function LocationControl({ controls }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close when tapping/clicking anywhere outside the popover. Listens during
  // the CAPTURE phase, not bubble — the Google Map (mobile's Map tab) runs its
  // own gesture handling on tap that stops the event from ever bubbling up to
  // document, so a normal bubble-phase listener never saw taps on the map and
  // the popover was stuck open. Capture runs on the way down, before the
  // map's own handler gets a chance to swallow it, so this fires regardless.
  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  // Allow any component (e.g. AddressPrompt) to open the picker without prop drilling.
  useEffect(() => {
    function onOpen() { setOpen(true) }
    document.addEventListener('jpc:open-location', onOpen)
    return () => document.removeEventListener('jpc:open-location', onOpen)
  }, [])

  const label = controls.tracking ? 'Live' : controls.address || 'Set location'

  // Picking a real address (or typing one) means the visitor wants a fixed
  // point, not a moving one — stop live tracking first, or the very next GPS
  // tick would silently overwrite what they just typed.
  const handleCoords = (coords: { lat: number; lng: number } | null) => {
    if (controls.tracking) controls.onStopTracking()
    controls.onCoords(coords)
    if (coords) setOpen(false)
  }
  const handleAddressChange = (address: string) => {
    if (controls.tracking) controls.onStopTracking()
    controls.onAddressChange(address)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex max-w-[220px] items-center gap-1 sm:gap-1.5 rounded-full border border-slate-200 bg-white py-1.5 pl-2 pr-2.5 text-xs sm:pl-2.5 sm:pr-3 sm:text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:bg-slate-50 cursor-pointer"
      >
        {/* Filled once an address is set — on mobile the label text collapses
            away below (leaving just this icon), so the fill is the only
            confirmation that the address actually stuck. A solid dot takes
            over instead while live tracking — static, not pulsing, since this
            sits in the header at all times and a constant blink there was
            distracting rather than informative. */}
        {controls.tracking ? (
          <span className="flex h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 items-center justify-center" aria-hidden="true">
            <span className="inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
        ) : (
          <PinIcon filled={!!controls.address} className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-primary" />
        )}
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

          {controls.tracking ? (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                </span>
                Live — updating as you move
              </span>
              <button
                onClick={controls.onStopTracking}
                className="shrink-0 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Stop
              </button>
            </div>
          ) : (
            <button
              onClick={controls.onStartTracking}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 active:bg-primary/20 cursor-pointer"
            >
              <PinIcon className="h-4 w-4 shrink-0" />
              Share my live location
            </button>
          )}

          <div className="my-3 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-100" />
            or enter an address
            <span className="h-px flex-1 bg-slate-100" />
          </div>

          <AddressInput
            value={controls.tracking ? '' : controls.address}
            onChange={handleAddressChange}
            onCoords={handleCoords}
            placeholder="Enter your address"
          />

          {controls.geoError && <p className="mt-2 text-xs text-red-600">{controls.geoError}</p>}
        </div>
      )}
    </div>
  )
}
