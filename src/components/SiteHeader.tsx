'use client'

import LocationControl, { type LocationControls } from '@/components/home/LocationControl'
import { StarOfDavid } from '@/components/icons'
import { useSiteSettings } from '@/lib/useSiteSettings'
import type { SiteSettings } from '@/lib/siteSettings'

type Props = {
  /** Called when the visitor clicks the site title — takes them back to the
   *  Landing page. */
  onGoHome: () => void
  /** Address anchor for proximity sorting (top-right pill). */
  location: LocationControls
  /** Admin-preview only: render with these settings instead of the live,
   *  fetched ones — used by the Site tab's Preview button. */
  previewSettings?: SiteSettings
}

export default function SiteHeader({ onGoHome, location, previewSettings }: Props) {
  const live = useSiteSettings()
  const settings = previewSettings ?? live
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
          {settings.logoUrl?.trim() ? (
            <span
              className={`${location.address ? 'block' : 'hidden'} sm:block h-9 w-9 shrink-0 rounded-xl bg-cover bg-center`}
              style={{ backgroundImage: `url(${settings.logoUrl})` }}
              aria-hidden="true"
            />
          ) : (
            <span className={`${location.address ? 'grid' : 'hidden'} sm:grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-white`}>
              <StarOfDavid className="h-5 w-5" />
            </span>
          )}
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[15px] font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors">
              {settings.name}
            </span>
            <span className="block truncate text-[11px] text-slate-500">
              {settings.tagline}
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
