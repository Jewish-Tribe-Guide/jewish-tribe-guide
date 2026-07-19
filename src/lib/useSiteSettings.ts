'use client'

import { useEffect, useState } from 'react'
import { SITE_SETTINGS_DEFAULTS, type SiteSettings } from './siteSettings'

// Module-level cache — every consumer (header, hero, footer) shares one fetch.
let cache: SiteSettings | null = null
let inflight: Promise<SiteSettings> | null = null

/** The site's branding text (name/tagline/hero title/mission). Returns the
 *  community.config defaults immediately (no loading flash for header/footer
 *  text that renders on first paint), then swaps in the saved settings once
 *  fetched — a no-op if nothing's been customized yet. Falls back to the same
 *  defaults if /api/site-settings is unreachable. */
export function useSiteSettings(): SiteSettings {
  const [settings, setSettings] = useState<SiteSettings>(cache ?? SITE_SETTINGS_DEFAULTS)

  useEffect(() => {
    if (cache) return
    inflight ??= fetch('/api/site-settings')
      .then((res) => res.json())
      .then((body) => (body.ok && body.settings ? (body.settings as SiteSettings) : SITE_SETTINGS_DEFAULTS))
      .catch(() => SITE_SETTINGS_DEFAULTS)
    let active = true
    inflight.then((loaded) => {
      cache = loaded
      if (active) setSettings(loaded)
    })
    return () => {
      active = false
    }
  }, [])

  return settings
}
