'use client'

import type { Audience } from '@/types'

type Props = {
  audience: Audience
  onSwitchAudience: (audience: Audience) => void
  /** Called when the visitor clicks the site title — takes them back to the
   *  Landing fork so they can re-choose their audience. */
  onGoHome: () => void
}

const TABS: { audience: Audience; label: string }[] = [
  { audience: 'patient', label: 'Patients' },
  { audience: 'community', label: 'Community' },
]

export default function SiteHeader({ audience, onSwitchAudience, onGoHome }: Props) {
  return (
    <>
      {/* Blue brand zone — title + subtitle only */}
      <header className="bg-primary text-white">
        <div className="max-w-4xl mx-auto px-4 py-8 text-center">
          <button
            onClick={onGoHome}
            className="text-4xl sm:text-5xl font-bold mb-3 hover:opacity-80 transition-opacity cursor-pointer"
          >
            Philadelphia Jewish Community
          </button>
          <p className="text-blue-100/75 text-sm">
            Connecting patients, families, and neighbors with Philadelphia&apos;s Jewish community
          </p>
        </div>
      </header>

      {/* Audience toggle — its own row, sitting on the seam below the blue banner */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex justify-center">
          <div className="inline-flex rounded-full bg-slate-100 p-1">
            {TABS.map((tab) => {
              const active = audience === tab.audience
              return (
                <button
                  key={tab.audience}
                  onClick={() => onSwitchAudience(tab.audience)}
                  aria-pressed={active}
                  className={[
                    'px-5 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer',
                    active
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-slate-500 hover:text-slate-700',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

    </>
  )
}
