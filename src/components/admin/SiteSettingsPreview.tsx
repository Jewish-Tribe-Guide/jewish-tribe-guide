'use client'

import { useState } from 'react'
import type { SiteSettings } from '@/lib/siteSettings'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import HeroHeading from '@/components/home/HeroHeading'
import DevicePreviewFrame from './DevicePreviewFrame'

// A preview of the header, home screen hero, and footer — the exact same
// components a visitor sees, fed by the admin's in-progress (unsaved) draft.
// The category grid itself isn't part of what's being previewed here (that's
// category content, not site settings), so this stops at the hero.

export default function SiteSettingsPreview({ settings, onClose }: { settings: SiteSettings; onClose: () => void }) {
  const [query, setQuery] = useState('')

  return (
    <DevicePreviewFrame onClose={onClose}>
      <SiteHeader onGoHome={() => {}} location={{ address: '', onAddressChange: () => {}, onCoords: () => {} }} previewSettings={settings} />

      <HeroHeading settings={settings} query={query} onQueryChange={setQuery} interactive={false} />

      <p className="mt-6 text-center text-xs text-muted">
        The category grid below this isn’t shown here — it’s not part of site settings.
      </p>

      <SiteFooter previewSettings={settings} />
    </DevicePreviewFrame>
  )
}
