'use client'

import Image from 'next/image'
import { useCallback, useEffect, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import type { SiteSettings } from '@/lib/siteSettings'
import type { HomeSection, DraftHomeSection } from '@/lib/homeSections'
import { saveHomeSections } from '@/lib/homeSectionsDraft'
import DevicePreviewFrame from './DevicePreviewFrame'
import { previewUrl, writePreviewDraft } from '@/lib/previewDraft'
import { useActiveCommunity } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import HomeSectionManager, { useCardOptions } from './HomeSectionManager'
import DesktopTopicsManager from './DesktopTopicsManager'
import DesktopNavEditor from './DesktopNavEditor'
import MobileTabsEditor from './MobileTabsEditor'
import {
  DEFAULT_MOBILE_TABS,
  DEFAULT_DESKTOP_NAV_ITEMS,
  DESKTOP_ACCENT_PRESETS,
  FEATURED_CARD_COUNT,
} from '@/lib/siteSettings'

// ── One component, three tabs — Site (shared), Desktop, Mobile — sharing a
// single draft and Save button so switching tabs never silently drops a
// half-finished edit (see SiteSettingsLayout, which mounts this once and
// passes `section`). Site carries the branding shared by both devices (name,
// mission, logo, search placeholder), the home-screen section grouping, and
// the feedback form. Desktop carries the top nav, the home screen's cards
// and their order, the Browse card's own eyebrow/heading, the hero band, and
// the accent color. Mobile carries the home screen heading, the tagline, and
// the bottom tab bar. Nothing goes live until you save.

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

function sectionsEqual(a: DraftHomeSection[], b: DraftHomeSection[]): boolean {
  const strip = (s: DraftHomeSection[]) => s.map(({ id, title, cardIds }) => ({ id, title, cardIds }))
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b))
}

export default function SiteSettingsEditor({
  token,
  section,
}: {
  token: string
  /** Which admin tab is rendering this. All three tabs share one component
   *  instance (see AdminTabs) so the draft and the single Save button
   *  survive switching between them — a half-finished edit on one tab isn't
   *  silently dropped because you stepped over to another. */
  section: 'site' | 'desktop' | 'mobile'
}) {
  // Which community the preview should open — the one the console is editing.
  const { community } = useActiveCommunity()
  const [settings, setSettings] = useState<SiteSettings | null>(null)
  const [draft, setDraft] = useState<SiteSettings | null>(null)
  const [sections, setSections] = useState<HomeSection[] | null>(null)
  const [sectionsDraft, setSectionsDraft] = useState<DraftHomeSection[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedNotice, setSavedNotice] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [uploadingHeroImage, setUploadingHeroImage] = useState(false)
  const [heroImageError, setHeroImageError] = useState<string | null>(null)

  // The preview iframe is genuinely navigable (real `src` mode — see
  // DevicePreviewFrame), so its own link clicks add entries to the tab's
  // joint session history same as any other navigation. That's why the
  // explicit "Back to editor" button below is plain state, not
  // history.back(): once the visitor has clicked around inside the preview,
  // history.back() steps the *iframe's* history instead of closing the
  // overlay — visibly doing nothing. Deliberately left alone here; fixing
  // that would need per-navigation bookkeeping this doesn't have.
  //
  // Real trackpad/browser Back is a different problem this DOES fix: it's
  // not a call this component makes, so there's no "reroute it away from
  // history" option — the only way to catch it is a pushState + popstate
  // marker (below). One marker entry is pushed on open; any popstate while
  // `previewing` closes the overlay unconditionally, without inspecting
  // which entry actually got consumed — an iframe-internal nav quietly
  // doesn't fire this window's popstate at all (nested browsing contexts
  // don't), so by the time it does fire here, a top-level entry genuinely
  // popped and closing is correct. The one tradeoff: closing via the button
  // instead leaves the marker orphaned on the stack, so a much later,
  // unrelated Back press silently consumes it once — acceptable next to the
  // alternative of Back never closing the preview at all.
  function openPreview() {
    // Snapshot the draft BEFORE the frame mounts — the page inside reads it on
    // load, so writing it afterwards would race the iframe and show saved
    // settings instead. See previewDraft.ts.
    if (draft && sectionsDraft) writePreviewDraft({ settings: draft, sections: sectionsDraft })
    history.pushState({ ...(window.history.state ?? {}), sitePreview: true }, '')
    setPreviewing(true)
  }

  function closePreview() {
    setPreviewing(false)
  }

  useEffect(() => {
    if (!previewing) return
    function onPopState() {
      setPreviewing(false)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [previewing])

  const load = useCallback(async () => {
    setError(null)
    try {
      const [settingsRes, sectionsRes] = await Promise.all([
        fetch(withCommunity('/api/admin/site-settings', community.slug), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(withCommunity('/api/admin/home-sections', community.slug), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])
      const settingsBody = await parseOkJson<{ settings: SiteSettings }>(settingsRes, 'Failed to load.')
      const sectionsBody = await parseOkJson<{ sections: HomeSection[] }>(sectionsRes, 'Failed to load.')

      setSettings(settingsBody.settings)
      setDraft(settingsBody.settings)
      setSections(sectionsBody.sections)
      setSectionsDraft(sectionsBody.sections)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community.slug])

  useLoadOnMount(load)

  function set<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
    setSavedNotice(false)
  }

  // Uploads the picked file to storage and drops the resulting public URL
  // onto the draft — same as pasting a URL, so it's still batched into the
  // normal Save changes flow rather than taking effect immediately.
  async function uploadLogo(file: File) {
    setLogoError(null)
    setUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const json = await fetchJson<{ url: string }>(
        '/api/admin/site-settings/logo',
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData },
        'Upload failed.',
      )
      set('logoUrl', json.url)
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploadingLogo(false)
    }
  }

  // Same shape as uploadLogo above — uploads to storage and drops the
  // resulting public URL onto the draft's desktopHeroImage, batched into the
  // normal Save changes flow rather than taking effect immediately. Alt text
  // isn't touched here — it's a separate field the admin fills in themselves,
  // since a filename can't describe what's in the photo.
  async function uploadHeroImage(file: File) {
    setHeroImageError(null)
    setUploadingHeroImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const json = await fetchJson<{ url: string }>(
        '/api/admin/site-settings/hero-image',
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData },
        'Upload failed.',
      )
      setDraft((d) => (d ? { ...d, desktopHeroImage: { url: json.url, alt: d.desktopHeroImage?.alt ?? '' } } : d))
      setSavedNotice(false)
    } catch (err) {
      setHeroImageError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploadingHeroImage(false)
    }
  }

  function setSectionsAndClearNotice(next: DraftHomeSection[]) {
    setSectionsDraft(next)
    setSavedNotice(false)
  }

  // Discards every unsaved edit on this tab — text fields and sections alike
  // — back to what's actually live.
  function cancel() {
    setDraft(settings)
    setSectionsDraft(sections)
    setError(null)
    setSavedNotice(false)
  }

  async function save() {
    if (!draft || !sections || !sectionsDraft) return
    setError(null)
    setSaving(true)
    try {
      if (JSON.stringify(settings) !== JSON.stringify(draft)) {
        const body = await fetchJson<{ settings: SiteSettings }>(
          withCommunity('/api/admin/site-settings', community.slug),
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(draft),
          },
          'Save failed.',
        )
        setSettings(body.settings)
        setDraft(body.settings)
      }

      if (!sectionsEqual(sections, sectionsDraft)) {
        const saved = await saveHomeSections(token, community.slug, sections, sectionsDraft)
        setSections(saved)
        setSectionsDraft(saved)
      }

      setSavedNotice(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  if (error && !draft) {
    return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  }
  if (!draft || !sectionsDraft) {
    return <p className="text-sm text-muted">Loading…</p>
  }

  if (previewing) {
    return (
      <DevicePreviewFrame
        src={previewUrl(community.slug)}
        onClose={closePreview}
        // Open on whichever device is being edited, so Preview answers the
        // question actually being asked. Still switchable inside the preview.
        initialDevice={section === 'mobile' ? 'mobile' : 'desktop'}
      />
    )
  }

  const dirty =
    !settings || JSON.stringify(settings) !== JSON.stringify(draft) || !sections || !sectionsEqual(sections, sectionsDraft)

  const isSite = section === 'site'
  const isDesktop = section === 'desktop'
  const isMobile = section === 'mobile'

  return (
    <div>
      {isSite && (
        <p className="text-sm text-muted mb-4">
          Everything that feeds both desktop and mobile — the branding, the mission, the section
          groups, the search placeholder, and the feedback form. The pieces that exist on only one
          device are on the Desktop or Mobile tab. Nothing goes live until you click Save changes
          below.
        </p>
      )}
      {isDesktop && (
        <p className="text-sm text-muted mb-4">
          Everything that exists on desktop only — the top nav, the home screen&rsquo;s cards and
          their order, the hero band, and the accent color. Everything shared by both devices —
          branding, sections, search placeholder — is on the Site tab. Nothing goes live until you
          click Save changes below.
        </p>
      )}
      {isMobile && (
        <p className="text-sm text-muted mb-4">
          Everything that exists on mobile only — the home screen heading, the tagline, and the
          bottom tab bar. Everything shared by both devices is on the Site tab. Nothing goes live
          until you click Save changes below.
        </p>
      )}

      {error && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{error}</p>
      )}

      {isSite && (
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 max-w-2xl">
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">Site name</span>
          <input value={draft.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
          <span className="block text-[11px] text-muted mt-1">Shown in the header and footer.</span>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">Mission</span>
          <textarea rows={2} value={draft.mission} onChange={(e) => set('mission', e.target.value)} className={inputClass} />
          <span className="block text-[11px] text-muted mt-1">
            Shown under the home screen heading on mobile, and reused as the footer blurb and
            &lt;meta description&gt;. Desktop has its own separate headline/subhead — see the Desktop
            tab&rsquo;s Hero card.
          </span>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">Search placeholder</span>
          <input
            value={draft.searchPlaceholder}
            onChange={(e) => set('searchPlaceholder', e.target.value)}
            className={inputClass}
          />
          <span className="block text-[11px] text-muted mt-1">
            The example text inside the search box, on both devices — e.g. &ldquo;Search — kosher
            food, mikvah, shuls, schools…&rdquo;. Worth updating when the category list changes.
          </span>
        </label>
        <div className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">Logo</span>
          <div className="flex items-center gap-3">
            {draft.logoUrl?.trim() && (
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl">
                {/* Same reasoning as the header's mark: an attribute rather
                    than a URL interpolated into a style string. `unoptimized`
                    because this one previews a logo the admin may have
                    uploaded seconds ago — going through the image optimizer
                    would risk showing them a cached copy of the old file while
                    they're checking whether the new one took. */}
                <Image
                  src={draft.logoUrl}
                  alt="Site logo preview"
                  fill
                  sizes="36px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            )}
            <label className="shrink-0 text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-3 py-2 hover:bg-slate-50 transition-colors cursor-pointer">
              {uploadingLogo ? 'Uploading…' : 'Upload image'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) uploadLogo(file)
                }}
                disabled={uploadingLogo}
                className="hidden"
              />
            </label>
            {draft.logoUrl?.trim() && (
              <button
                type="button"
                onClick={() => set('logoUrl', null)}
                className="shrink-0 text-sm text-muted hover:text-red-600 transition-colors cursor-pointer"
              >
                Remove
              </button>
            )}
          </div>
          {logoError && <span className="block text-[11px] text-red-600 mt-1">{logoError}</span>}
          <label className="block mt-2">
            <span className="block text-[11px] text-muted mb-1">…or paste an image URL directly</span>
            <input
              value={draft.logoUrl ?? ''}
              onChange={(e) => set('logoUrl', e.target.value.trim() || null)}
              placeholder="https://…"
              className={inputClass}
            />
          </label>
          <span className="block text-[11px] text-muted mt-1">
            Shown in the header instead of the default mark. Leave blank to keep the default.
          </span>
        </div>
      </div>
      )}

      {/* Sections are one set of groups rendered two different ways, so they
          live here with the rest of the settings that feed both devices. */}
      {isSite && (
        <div className="mt-6 max-w-2xl">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Home page sections</h3>
          <p className="text-[11px] text-muted mb-2">
            One set of groups, shown differently per device: on desktop they’re the categories
            mega-menu (see the Desktop tab&rsquo;s Top Nav bar); on mobile they’re the labelled card
            grid running down the home screen. Renaming or regrouping changes both.
          </p>
          <HomeSectionManager sections={sectionsDraft} onChange={setSectionsAndClearNotice} />
        </div>
      )}

      {isDesktop && (
        <div className="mt-6 max-w-2xl">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Top nav bar</h3>
          <p className="text-[11px] text-muted mb-2">
            The header&rsquo;s top-level items, desktop only — Categories, Map, and More by default.
          </p>
          <DesktopNavEditor
            items={draft.desktopNavItems.length > 0 ? draft.desktopNavItems : DEFAULT_DESKTOP_NAV_ITEMS}
            onChange={(items) => set('desktopNavItems', items)}
          />
        </div>
      )}

      {isDesktop && (
        <div className="mt-6 max-w-2xl">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Home screen cards</h3>
          <p className="text-[11px] text-muted mb-2">
            Browse &amp; search, Popular right now, Explore the map, Davening Times, and Shabbat
            Times — the desktop home screen&rsquo;s cards, in order. Rename, reorder, or remove any
            of them.
          </p>
          <DesktopTopicsManager
            sections={sectionsDraft}
            onChange={setSectionsAndClearNotice}
            browseCopy={{
              eyebrow: draft.desktopBrowseEyebrow,
              heading: draft.desktopBrowseHeading,
              onEyebrowChange: (value) => set('desktopBrowseEyebrow', value),
              onHeadingChange: (value) => set('desktopBrowseHeading', value),
            }}
          />
        </div>
      )}

      {isDesktop && (
        <div className="mt-6 max-w-2xl">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Featured cards</h3>
          <p className="text-[11px] text-muted mb-2">
            The “Popular right now” row between the search box and the map. Phones don’t show this
            row at all — they get the full card grid instead.
          </p>
          <FeaturedCardsPicker
            value={draft.featuredCardIds}
            onChange={(ids) => set('featuredCardIds', ids)}
          />
        </div>
      )}

      {isDesktop && (
        <div className="mt-6 max-w-2xl">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Hero</h3>
          <p className="text-[11px] text-muted mb-2">
            The warm band at the top of the desktop home screen — its own headline/subhead, separate
            from mobile&rsquo;s heading (Mobile tab), plus the photo beside it.
          </p>
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">Headline</span>
              <input
                value={draft.desktopHeroHeadline}
                onChange={(e) => set('desktopHeroHeadline', e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">Subhead</span>
              <textarea
                rows={2}
                value={draft.desktopHeroSubhead}
                onChange={(e) => set('desktopHeroSubhead', e.target.value)}
                className={inputClass}
              />
              <span className="block text-[11px] text-muted mt-1">Optional — leave blank to show the headline alone.</span>
            </label>
            <div className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">Photo</span>
              <div className="flex items-center gap-3">
                {draft.desktopHeroImage?.url && (
                  <div className="relative h-9 w-16 shrink-0 overflow-hidden rounded-md">
                    <Image
                      src={draft.desktopHeroImage.url}
                      alt={draft.desktopHeroImage.alt || 'Hero photo preview'}
                      fill
                      sizes="64px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                )}
                <label className="shrink-0 text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-3 py-2 hover:bg-slate-50 transition-colors cursor-pointer">
                  {uploadingHeroImage ? 'Uploading…' : 'Upload image'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) uploadHeroImage(file)
                    }}
                    disabled={uploadingHeroImage}
                    className="hidden"
                  />
                </label>
                {draft.desktopHeroImage?.url && (
                  <button
                    type="button"
                    onClick={() => set('desktopHeroImage', null)}
                    className="shrink-0 text-sm text-muted hover:text-red-600 transition-colors cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
              {heroImageError && <span className="block text-[11px] text-red-600 mt-1">{heroImageError}</span>}
              <label className="block mt-2">
                <span className="block text-[11px] text-muted mb-1">…or paste an image URL directly</span>
                <input
                  value={draft.desktopHeroImage?.url ?? ''}
                  onChange={(e) => {
                    const url = e.target.value.trim()
                    set('desktopHeroImage', url ? { url, alt: draft.desktopHeroImage?.alt ?? '' } : null)
                  }}
                  placeholder="https://…"
                  className={inputClass}
                />
              </label>
              <label className="block mt-2">
                <span className="block text-[11px] text-muted mb-1">Alt text (describe the photo)</span>
                <input
                  value={draft.desktopHeroImage?.alt ?? ''}
                  onChange={(e) => {
                    const alt = e.target.value
                    if (draft.desktopHeroImage) set('desktopHeroImage', { ...draft.desktopHeroImage, alt })
                  }}
                  disabled={!draft.desktopHeroImage?.url}
                  className={inputClass}
                />
              </label>
              <span className="block text-[11px] text-muted mt-1">
                Leave blank to show a plain gradient instead of a photo.
              </span>
            </div>
          </div>
        </div>
      )}

      {isDesktop && (
        <div className="mt-6 max-w-2xl">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Colors</h3>
          <p className="text-[11px] text-muted mb-2">
            The home screen&rsquo;s accent color — the eyebrows above each card, the hero band, and
            the Davening/Shabbat cards&rsquo; call-to-action buttons.
          </p>
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {DESKTOP_ACCENT_PRESETS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => set('desktopAccentColor', hex)}
                  aria-label={`Use ${hex}`}
                  aria-pressed={draft.desktopAccentColor.toLowerCase() === hex.toLowerCase()}
                  className={`h-8 w-8 rounded-full border-2 cursor-pointer ${
                    draft.desktopAccentColor.toLowerCase() === hex.toLowerCase() ? 'border-slate-900' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
              <label className="flex items-center gap-2">
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(draft.desktopAccentColor) ? draft.desktopAccentColor : '#b45309'}
                  onChange={(e) => set('desktopAccentColor', e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border border-slate-300 p-0"
                  aria-label="Custom color"
                />
                <input
                  value={draft.desktopAccentColor}
                  onChange={(e) => set('desktopAccentColor', e.target.value)}
                  placeholder="#b45309"
                  className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {isMobile && (
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 max-w-2xl">
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">Home screen heading</span>
          <input value={draft.heroTitle} onChange={(e) => set('heroTitle', e.target.value)} className={inputClass} />
          <span className="block text-[11px] text-muted mt-1">
            The big heading at the top of the mobile home screen. Desktop has its own separate hero
            headline — see the Desktop tab&rsquo;s Hero card.
          </span>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">Tagline</span>
          <input value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} className={inputClass} />
          <span className="block text-[11px] text-muted mt-1">
            Not currently shown anywhere on the site — kept here in case that changes.
          </span>
        </label>
      </div>
      )}

      {isMobile && (
        <div className="mt-6 max-w-2xl">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Mobile tab bar</h3>
          <p className="text-[11px] text-muted mb-2">
            Rename, reorder, add, or remove the tabs along the bottom of the screen. Desktop has no
            tab bar — it navigates by the top nav instead (Desktop tab).
          </p>
          <MobileTabsEditor
            tabs={draft.mobileTabs ?? DEFAULT_MOBILE_TABS}
            onChange={(tabs) => set('mobileTabs', tabs)}
          />
        </div>
      )}

      {isSite && (
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 max-w-2xl mt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="block text-sm font-medium text-slate-800">Feedback form</span>
            <span className="block text-[11px] text-muted mt-0.5">
              The &ldquo;Send feedback&rdquo; link and form shown in the footer. Turn it off to remove it
              from the site entirely.
            </span>
          </div>
          <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.feedbackEnabled}
              onChange={(e) => set('feedbackEnabled', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            />
            <span className="text-xs font-medium text-slate-700">Enabled</span>
          </label>
        </div>

        {draft.feedbackEnabled && (
          <>
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">Button label</span>
              <input
                value={draft.feedbackButtonLabel}
                onChange={(e) => set('feedbackButtonLabel', e.target.value)}
                className={inputClass}
              />
              <span className="block text-[11px] text-muted mt-1">
                The footer link text (an arrow is added automatically).
              </span>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">Form heading</span>
              <input
                value={draft.feedbackHeading}
                onChange={(e) => set('feedbackHeading', e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">Success message</span>
              <textarea
                rows={2}
                value={draft.feedbackSuccessMessage}
                onChange={(e) => set('feedbackSuccessMessage', e.target.value)}
                className={inputClass}
              />
              <span className="block text-[11px] text-muted mt-1">Shown after someone submits feedback.</span>
            </label>
          </>
        )}
      </div>
      )}

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={openPreview}
          className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-4 py-2 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          Preview
        </button>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="text-sm font-medium bg-primary text-white rounded-md px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-60 cursor-pointer"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          onClick={cancel}
          disabled={saving || !dirty}
          className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-4 py-2 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
        >
          Cancel
        </button>
        {savedNotice && !dirty && <span className="text-sm text-green-700">Saved.</span>}
      </div>


      {isSite && (
        <p className="text-[11px] text-muted mt-5 max-w-xl">
          These also drive the browser tab title, search-engine description, and “Add to Home
          Screen” app name.
        </p>
      )}
    </div>
  )
}

// ── Featured cards picker ─────────────────────────────────────────────────────
// The three cards the desktop home screen shows between the search box and the
// map. One dropdown per slot, each offering the same card set the section
// editor uses (see useCardOptions).
//
// Every slot can be left on "Auto", including all three — that's the default,
// and it fills the row with the categories that have the most listings. So
// this never has to be touched for the home screen to look deliberate, and a
// half-configured row (one pick, two auto) still renders three cards.

function FeaturedCardsPicker({
  value,
  onChange,
}: {
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const cardOptions = useCardOptions()

  // Slots are positional, but `value` is a compact list (no holes) — an "Auto"
  // slot simply isn't in it. Setting slot 2 while slot 1 is Auto therefore
  // appends rather than writing to index 1; the home screen fills the rest
  // from the same most-listings fallback either way.
  const setSlot = (slot: number, id: string) => {
    const next = [...value]
    if (id === '') next.splice(slot, 1)
    else if (slot < next.length) next[slot] = id
    else next.push(id)
    // A card picked twice would render the same tile twice — keep the first.
    onChange([...new Set(next)].slice(0, FEATURED_CARD_COUNT))
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
      <p className="text-[11px] text-muted">
        Shown on desktop between the search box and the map. Leave a slot on
        &ldquo;Auto&rdquo; to fill it with the category that has the most listings.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: FEATURED_CARD_COUNT }, (_, slot) => (
          <label key={slot} className="block">
            <span className="block text-[11px] font-medium text-slate-600 mb-1">Slot {slot + 1}</span>
            <select
              value={value[slot] ?? ''}
              onChange={(e) => setSlot(slot, e.target.value)}
              className={inputClass}
            >
              <option value="">Auto (most listings)</option>
              {cardOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  )
}
