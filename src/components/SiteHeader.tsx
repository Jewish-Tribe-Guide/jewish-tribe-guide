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

export default function SiteHeader({ onGoHome, location }: Props) {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200/80 pt-[env(safe-area-inset-top)]">
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center">
        <button
          onClick={onGoHome}
          className="flex items-center gap-2.5 cursor-pointer group text-left"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-white">
            <StarOfDavid className="h-5 w-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors">
              Philadelphia Jewish Community
            </span>
            <span className="hidden sm:block text-[11px] text-slate-500">
              Guide for residents, visitors, and patients
            </span>
          </span>
        </button>

        <div className="ml-auto">
          <LocationControl controls={location} />
        </div>
      </div>
    </header>
  )
}
