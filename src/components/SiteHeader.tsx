'use client'

import type { Audience } from '@/types'

type Props = {
  /** null on the landing page — neither tab is highlighted. */
  audience: Audience | null
  onSwitchAudience: (audience: Audience) => void
  /** Called when the visitor clicks the site title — takes them back to the
   *  Landing page. */
  onGoHome: () => void
}

const TABS: { audience: Audience; icon: string; label: string; shortLabel: string }[] = [
  { audience: 'patient', icon: '🤝', label: 'Patients & Families', shortLabel: 'Patients' },
  { audience: 'community', icon: '🏘️', label: 'Community', shortLabel: 'Community' },
]

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

export default function SiteHeader({ audience, onSwitchAudience, onGoHome }: Props) {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200/80">
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center">
        <button
          onClick={onGoHome}
          className="flex items-center gap-2.5 cursor-pointer group text-left"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-white">
            <StarOfDavid className="h-5 w-5" />
          </span>
          <span className="hidden lg:block leading-tight">
            <span className="block text-[15px] font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors">
              Philadelphia Jewish Community
            </span>
            <span className="block text-[11px] text-slate-500">
              Support for patients, families, and neighbors
            </span>
          </span>
        </button>

        {/* Centered audience tabs — Airbnb Homes/Experiences style. */}
        <nav className="absolute left-1/2 -translate-x-1/2 flex h-full items-stretch gap-1 sm:gap-4">
          {TABS.map((tab) => {
            const active = audience === tab.audience
            return (
              <button
                key={tab.audience}
                onClick={() => onSwitchAudience(tab.audience)}
                aria-pressed={active}
                className={[
                  'relative flex items-center gap-1.5 px-2 sm:px-3 text-sm cursor-pointer transition-colors',
                  active
                    ? 'font-semibold text-slate-900'
                    : 'font-medium text-slate-500 hover:text-slate-800',
                ].join(' ')}
              >
                <span className="text-base" aria-hidden="true">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
                {active && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-slate-900" aria-hidden="true" />
                )}
              </button>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
