'use client'

import LocationControl, { type LocationControls } from '@/components/home/LocationControl'
import CommunitySwitcher from '@/components/CommunitySwitcher'
import { StarOfDavid } from '@/components/icons'
import { useSiteSettings } from '@/lib/useSiteSettings'
import { useActiveCommunity } from '@/lib/useCommunities'
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
  const { community, communities, setCommunity } = useActiveCommunity()
  // The admin preview renders this header against a draft, not the live site —
  // a switcher there would change what the real visitor sees from inside a
  // preview, so it's suppressed by passing no communities.
  const switchable = previewSettings ? null : communities
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200/80 pt-[env(safe-area-inset-top)]">
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center">
        {/* On mobile the logo only hides while no location is set — that's when
            the wide "Set location" pill competes with the full title + tagline
            for the row, and dropping the mark frees the ~46px needed to keep
            the text full. Once a location is set the pill collapses to just its
            pin, so the logo comes back. Always shown from sm up. */}
        {(() => {
          const mark = settings.logoUrl?.trim() ? (
            <span
              className={`${location.address ? 'block' : 'hidden'} sm:block h-9 w-9 shrink-0 rounded-xl bg-cover bg-center`}
              style={{ backgroundImage: `url(${settings.logoUrl})` }}
              aria-hidden="true"
            />
          ) : (
            <span className={`${location.address ? 'grid' : 'hidden'} sm:grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-white`}>
              <StarOfDavid className="h-5 w-5" />
            </span>
          )
          const title = (
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[15px] font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors">
                {settings.name}
              </span>
              <span className="block truncate text-[11px] text-slate-500">
                {settings.tagline}
              </span>
            </span>
          )

          // One community: the header is exactly what it always was — the whole
          // mark-plus-title block is a single "go home" button.
          if (!switchable || switchable.length < 2) {
            return (
              <button
                onClick={onGoHome}
                className="flex min-w-0 flex-1 items-center gap-2.5 cursor-pointer group text-left"
              >
                {mark}
                {title}
              </button>
            )
          }

          // Several communities: the title becomes the switcher (it already
          // names where you are), so "go home" moves onto the mark beside it.
          // Split into two controls rather than one because a button can't
          // nest inside a button.
          return (
            <div className="flex min-w-0 flex-1 items-center gap-2.5 group">
              <button onClick={onGoHome} aria-label="Home" className="contents cursor-pointer">
                {mark}
              </button>
              <CommunitySwitcher
                communities={switchable}
                activeSlug={community?.slug ?? null}
                onSelect={setCommunity}
              >
                {title}
              </CommunitySwitcher>
            </div>
          )
        })()}

        <div className="ml-auto">
          <LocationControl controls={location} />
        </div>
      </div>
    </header>
  )
}
