'use client'

import LocationControl, { type LocationControls } from '@/components/home/LocationControl'

type Props = {
  /** Called when the visitor clicks the site title — takes them back to the
   *  Landing page. */
  onGoHome: () => void
  /** Address anchor for proximity sorting (top-right pill). */
  location: LocationControls
}

/** Magen David mark — inline SVG so it renders identically everywhere
 *  (the ✡ character falls back to emoji presentation on some platforms). */
function StarOfDavid({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3 L19.8 16.5 L4.2 16.5 Z" />
      <path d="M12 21 L4.2 7.5 L19.8 7.5 Z" />
    </svg>
  )
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 21c-4.4-3.9-7-7.4-7-10.8A7 7 0 0 1 12 3a7 7 0 0 1 7 7.2c0 3.4-2.6 6.9-7 10.8z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  )
}

export default function SiteHeader({ onGoHome, location }: Props) {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200/80 pt-[env(safe-area-inset-top)]">
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center">
        <button
          onClick={onGoHome}
          className="flex min-w-0 flex-1 items-center gap-2.5 cursor-pointer group text-left"
        >
          {/* On mobile the logo only hides while no location is set — that's when
              the wide "Set location" pill competes with the full title + tagline
              for the row, and dropping the mark frees the ~46px needed to keep
              the text full. Once a location is set the pill collapses to just its
              pin, so the logo comes back. Always shown from sm up. */}
          <span className={`${location.address ? 'grid' : 'hidden'} sm:grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-white`}>
            <StarOfDavid className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[14px] sm:text-[15px] font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors">
              Philadelphia Jewish Community
            </span>
            <span className="block truncate text-[11px] text-slate-500">
              Guide for residents, visitors, and patients
            </span>
          </span>
        </button>

        <div className="ml-auto">
          <LocationControl controls={location} />
        </div>
      </div>

      {/* Mobile-only confirmation that a location is set. On desktop the pill
          already shows the address; on mobile the pill collapses to just the
          pin, so this strip is where the visitor sees (and can re-tap to
          change) their selected location. */}
      {location.address && (
        <button
          type="button"
          onClick={() => document.dispatchEvent(new Event('jpc:open-location'))}
          className="sm:hidden flex w-full items-center gap-1.5 border-t border-slate-100 bg-slate-50/70 px-4 py-1.5 text-left active:bg-slate-100"
        >
          <PinIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate text-[12px] text-slate-600">
            Distances from{' '}
            <span className="font-semibold text-slate-800">
              {location.address === 'Current location' ? 'your current location' : location.address}
            </span>
          </span>
        </button>
      )}
    </header>
  )
}
