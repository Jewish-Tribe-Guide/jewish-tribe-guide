'use client'

import { useState } from 'react'
import type { SiteSettings } from '@/lib/siteSettings'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import HeroHeading from '@/components/home/HeroHeading'

// A preview of the header, home screen hero, and footer — the exact same
// components a visitor sees, fed by the admin's in-progress (unsaved) draft.
// The category grid itself isn't part of what's being previewed here (that's
// category content, not site settings), so this stops at the hero.

export default function SiteSettingsPreview({ settings, onClose }: { settings: SiteSettings; onClose: () => void }) {
  const [query, setQuery] = useState('')

  return (
    <div>
      <SiteHeader onGoHome={() => {}} location={{ address: '', onAddressChange: () => {}, onCoords: () => {} }} previewSettings={settings} />

      <button
        onClick={onClose}
        className="text-sm text-muted hover:text-slate-700 underline my-4 cursor-pointer"
      >
        ← Back to editor
      </button>

      <HeroHeading settings={settings} query={query} onQueryChange={setQuery} interactive={false} />

      <p className="mt-6 text-center text-xs text-muted">
        The category grid below this isn’t shown here — it’s not part of site settings.
      </p>

      <SiteFooter previewSettings={settings} />
    </div>
  )
}
