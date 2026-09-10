'use client'

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
import HomeSectionManager from './HomeSectionManager'
import DesktopTopicsManager from './DesktopTopicsManager'
import DesktopNavEditor from './DesktopNavEditor'
import MobileTabsEditor from './MobileTabsEditor'
import CollapsibleSection from './CollapsibleSection'
import ImageUploadField from '@/components/ImageUploadField'
import {
  DEFAULT_MOBILE_TABS,
  DEFAULT_DESKTOP_NAV_ITEMS,
  DESKTOP_ACCENT_PRESETS,
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
  // Every field saveHomeSections actually persists (see its own `changed()`)
  // has to be listed here too — width was added to DraftHomeSection for the
  // side-by-side card layout and left out of this strip, so flipping a
  // card's Full/Half toggle never marked the form dirty and Save stayed
  // disabled.
  const strip = (s: DraftHomeSection[]) => s.map(({ id, title, cardIds, width }) => ({ id, title, cardIds, width }))
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

  // Both the logo and the hero photo upload through ImageUploadField now
  // (see its own render below) — it does the fetch, the reposition/re-zoom
  // step (ImageCropModal), and its own loading/error state internally, so
  // there's nothing bespoke left to do here beyond handing it `onChange`.

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
      <div className="max-w-2xl">
      <CollapsibleSection title="Branding" description="Site name, tagline, search placeholder, and logo." contentClassName="p-4 space-y-3">
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">Site name</span>
          <input value={draft.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
          <span className="block text-[11px] text-muted mt-1">Shown in the header and footer.</span>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">Tagline</span>
          <input value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} className={inputClass} />
          <span className="block text-[11px] text-muted mt-1">
            Not currently shown anywhere on the site — kept here in case that changes.
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
          <ImageUploadField
            value={draft.logoUrl ?? ''}
            onChange={(url) => set('logoUrl', url || null)}
            uploadUrl="/api/admin/site-settings/logo"
            token={token}
            shape="square"
            helpText="Shown in the header instead of the default mark. Leave blank to keep the default."
          />
        </div>
      </CollapsibleSection>
      </div>
      )}

      {/* Sections are one set of groups rendered two different ways, so they
          live here with the rest of the settings that feed both devices. */}
      {isSite && (
        <div className="mt-6 max-w-2xl">
          <CollapsibleSection
            title="Home page sections"
            description="One set of groups, shown differently per device: on desktop they’re the categories mega-menu (see the Desktop tab’s Top Nav bar); on mobile they’re the labelled card grid running down the home screen. Renaming or regrouping changes both."
            contentClassName="p-4"
          >
            <HomeSectionManager sections={sectionsDraft} onChange={setSectionsAndClearNotice} />
          </CollapsibleSection>
        </div>
      )}

      {isDesktop && (
        <div className="mt-6 max-w-2xl">
          <CollapsibleSection
            title="Top nav bar"
            description="The header’s top-level items, desktop only — Categories, Map, and More by default."
            contentClassName="p-4"
          >
            <DesktopNavEditor
              items={draft.desktopNavItems.length > 0 ? draft.desktopNavItems : DEFAULT_DESKTOP_NAV_ITEMS}
              onChange={(items) => set('desktopNavItems', items)}
            />
          </CollapsibleSection>
        </div>
      )}

      {isDesktop && (
        <div className="mt-6 max-w-2xl">
          <CollapsibleSection
            title="Hero"
            description="The warm band at the top of the desktop home screen — its own headline/subhead, separate from mobile’s heading (Mobile tab), plus the photo beside it."
            contentClassName="p-4 space-y-3"
          >
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
              <ImageUploadField
                value={draft.desktopHeroImage?.url ?? ''}
                onChange={(url) =>
                  set('desktopHeroImage', url ? { url, alt: draft.desktopHeroImage?.alt ?? '' } : null)
                }
                uploadUrl="/api/admin/site-settings/hero-image"
                token={token}
                shape="square"
                // Wider than the icon/avatar default (1) — an approximation
                // of the actual band's shape (see HeroHeading.tsx's own
                // `min-h-[280px]` two-column grid, which has no single fixed
                // ratio since its height tracks the headline/subhead beside
                // it) close enough that what the admin frames here is what
                // `object-cover` actually shows, not a wild mismatch.
                aspect={4 / 3}
              />
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
          </CollapsibleSection>
        </div>
      )}

      {isDesktop && (
        <div className="mt-6 max-w-2xl">
          <CollapsibleSection
            title="Colors"
            description="The home screen’s accent color — the eyebrows above each card, the hero band, and the Davening/Shabbat cards’ call-to-action buttons."
            contentClassName="p-4 space-y-3"
          >
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
          </CollapsibleSection>
        </div>
      )}

      {isDesktop && (
        <div className="mt-6 max-w-2xl">
          <CollapsibleSection
            title="Home screen cards"
            description="Categories & Search, Davening Times, Update Listings, Map, Email Signup, and Jewish Times — the desktop home screen’s cards, in order. Rename each one’s eyebrow/heading, reorder, or remove it."
            contentClassName="p-4"
          >
            <DesktopTopicsManager
              sections={sectionsDraft}
              onChange={setSectionsAndClearNotice}
              settings={draft}
              onSettingChange={set}
            />
          </CollapsibleSection>
        </div>
      )}

      {isMobile && (
      <div className="max-w-2xl">
      <CollapsibleSection title="Branding" description="Home screen heading and subhead." contentClassName="p-4 space-y-3">
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">Home screen heading</span>
          <input value={draft.heroTitle} onChange={(e) => set('heroTitle', e.target.value)} className={inputClass} />
          <span className="block text-[11px] text-muted mt-1">
            The big heading at the top of the mobile home screen. Desktop has its own separate hero
            headline — see the Desktop tab&rsquo;s Hero card.
          </span>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">Subhead</span>
          <textarea rows={2} value={draft.mission} onChange={(e) => set('mission', e.target.value)} className={inputClass} />
          <span className="block text-[11px] text-muted mt-1">
            Shown under the home screen heading, and reused as the footer blurb and &lt;meta
            description&gt;. Desktop has its own separate headline/subhead — see the Desktop tab&rsquo;s
            Hero card.
          </span>
        </label>
      </CollapsibleSection>
      </div>
      )}

      {isMobile && (
        <div className="mt-6 max-w-2xl">
          <CollapsibleSection
            title="Mobile tab bar"
            description="Rename, reorder, add, or remove the tabs along the bottom of the screen. Desktop has no tab bar — it navigates by the top nav instead (Desktop tab)."
            contentClassName="p-4"
          >
            <MobileTabsEditor
              tabs={draft.mobileTabs ?? DEFAULT_MOBILE_TABS}
              onChange={(tabs) => set('mobileTabs', tabs)}
            />
          </CollapsibleSection>
        </div>
      )}

      {isSite && (
      <div className="max-w-2xl mt-6">
      <CollapsibleSection
        title="Feedback form"
        description={`The “Send feedback” link and form shown in the footer. Currently ${draft.feedbackEnabled ? 'enabled' : 'disabled'}.`}
        contentClassName="p-4 space-y-3"
      >
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.feedbackEnabled}
            onChange={(e) => set('feedbackEnabled', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
          />
          <span className="text-xs font-medium text-slate-700">Enabled</span>
        </label>

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
      </CollapsibleSection>
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
