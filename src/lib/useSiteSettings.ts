'use client'

import { SITE_SETTINGS_DEFAULTS, type SiteSettings } from './siteSettings'
import { readPreviewDraft } from './previewDraft'
import { useCommunityData } from './useCommunityData'

/** The active community's branding text (name/tagline/hero title/mission).
 *  Returns the community.config defaults immediately — no loading flash for
 *  header/footer text that renders on first paint — then swaps in the saved
 *  settings once fetched. Falls back to those same defaults if the API is
 *  unreachable. */
export function useSiteSettings(): SiteSettings {
  const { data } = useCommunityData<SiteSettings>(
    '/api/site-settings',
    (url) => {
      // Admin preview: the unsaved draft wins over whatever is stored, so the
      // frame shows the edits being made. See previewDraft.ts.
      const draft = readPreviewDraft()
      if (draft) return Promise.resolve(draft.settings)
      return fetch(url)
        .then((res) => res.json())
        .then((body) => (body.ok && body.settings ? (body.settings as SiteSettings) : SITE_SETTINGS_DEFAULTS))
        .catch(() => SITE_SETTINGS_DEFAULTS)
    },
    SITE_SETTINGS_DEFAULTS,
  )
  return data
}
