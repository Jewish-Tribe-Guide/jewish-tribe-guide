'use client'

import { useCallback, useEffect, useState } from 'react'
import type { SiteSettings } from '@/lib/siteSettings'
import type { HomeSection, DraftHomeSection } from '@/lib/homeSections'
import { saveHomeSections } from '@/lib/homeSectionsDraft'
import SiteSettingsPreview from './SiteSettingsPreview'
import HomeSectionManager, { useCardOptions } from './HomeSectionManager'
import MobileTabsEditor from './MobileTabsEditor'
import { DEFAULT_MOBILE_TABS, FEATURED_CARD_COUNT } from '@/lib/siteSettings'

// ── The Home page tab: the header/hero/footer branding text (name, tagline,
// heading, mission, logo), the home-screen section grouping, and the footer's
// feedback form — laid out in the same top-to-bottom order they appear on the
// actual home page. Everything here is a draft, batched into the one shared
// Save changes button — nothing goes live until you save. Mounted on /admin.

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
  /** Which admin tab is rendering this. Both tabs share one component instance
   *  (see AdminTabs) so the draft and the single Save button survive switching
   *  between them — a half-finished home screen edit isn't silently dropped
   *  because you stepped over to fix the tagline. */
  section: 'site' | 'home'
}) {
  // Which device's home screen is being edited. Not persisted — it's a lens on
  // the same draft, not a setting.
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
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

  // Preview gets its own history entry so browser/trackpad Back (and the
  // preview's own Back button, which calls closePreview) land back on this
  // editor instead of skipping past it to the categories list.
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      setPreviewing(!!(e.state as { editorPreview?: boolean } | null)?.editorPreview)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function openPreview() {
    setPreviewing(true)
    history.pushState({ ...(window.history.state ?? {}), editorPreview: true }, '')
  }

  function closePreview() {
    history.back()
  }

  const load = useCallback(async () => {
    setError(null)
    try {
      const [settingsRes, sectionsRes] = await Promise.all([
        fetch('/api/admin/site-settings', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/home-sections', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const settingsBody = await settingsRes.json()
      if (!settingsRes.ok || !settingsBody.ok) throw new Error(settingsBody.errors?.join(' ') || 'Failed to load.')
      const sectionsBody = await sectionsRes.json()
      if (!sectionsRes.ok || !sectionsBody.ok) throw new Error(sectionsBody.errors?.join(' ') || 'Failed to load.')

      setSettings(settingsBody.settings as SiteSettings)
      setDraft(settingsBody.settings as SiteSettings)
      setSections(sectionsBody.sections as HomeSection[])
      setSectionsDraft(sectionsBody.sections as HomeSection[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

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
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/admin/site-settings/logo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.errors?.join(' ') || 'Upload failed.')
      set('logoUrl', json.url as string)
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploadingLogo(false)
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
        const res = await fetch('/api/admin/site-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(draft),
        })
        const body = await res.json()
        if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Save failed.')
        setSettings(body.settings as SiteSettings)
        setDraft(body.settings as SiteSettings)
      }

      if (!sectionsEqual(sections, sectionsDraft)) {
        const saved = await saveHomeSections(token, sections, sectionsDraft)
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
      <SiteSettingsPreview
        settings={draft}
        sections={sectionsDraft}
        onClose={closePreview}
        // Open on whichever device is being edited, so Preview answers the
        // question actually being asked. Still switchable inside the preview.
        initialDevice={section === 'home' ? device : 'desktop'}
      />
    )
  }

  const dirty =
    !settings || JSON.stringify(settings) !== JSON.stringify(draft) || !sections || !sectionsEqual(sections, sectionsDraft)

  const isSite = section === 'site'

  return (
    <div>
      {isSite ? (
        <p className="text-sm text-muted mb-4">
          Everything that feeds both desktop and mobile — the branding, the home screen heading and
          mission, the section groups, and the feedback form. The pieces that exist on only one of
          the two are on the Desktop &amp; mobile tab. Nothing goes live until you click Save
          changes below.
        </p>
      ) : (
        <p className="text-sm text-muted mb-4">
          The parts that exist on only one device. Everything shared by both — headings, sections,
          branding — is on the Site tab. Nothing goes live until you click Save changes below.
        </p>
      )}

      {error && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{error}</p>
      )}

      {!isSite && (
        <div className="mb-5 inline-flex gap-0.5 rounded-md border border-slate-300 p-0.5">
          {(['desktop', 'mobile'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                device === d ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {d === 'desktop' ? '🖥️ Desktop' : '📱 Mobile'}
            </button>
          ))}
        </div>
      )}

      {isSite && (
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 max-w-2xl">
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">Site name</span>
          <input value={draft.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
          <span className="block text-[11px] text-muted mt-1">Shown in the header and footer.</span>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">Tagline</span>
          <input value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} className={inputClass} />
          <span className="block text-[11px] text-muted mt-1">Shown under the site name in the header.</span>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">Home screen heading</span>
          <input value={draft.heroTitle} onChange={(e) => set('heroTitle', e.target.value)} className={inputClass} />
          <span className="block text-[11px] text-muted mt-1">The big heading on the home screen.</span>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">Mission</span>
          <textarea rows={2} value={draft.mission} onChange={(e) => set('mission', e.target.value)} className={inputClass} />
          <span className="block text-[11px] text-muted mt-1">
            Shown under the home screen heading, and reused as the footer blurb.
          </span>
        </label>
        <div className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">Logo</span>
          <div className="flex items-center gap-3">
            {draft.logoUrl?.trim() && (
              <div
                className="h-9 w-9 rounded-xl shrink-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${draft.logoUrl})` }}
              />
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
            One set of groups, shown differently per device: on desktop they’re the nav tabs across
            the top and the All categories page they open; on mobile they’re the labelled card grid
            running down the home screen. Renaming or regrouping changes both.
          </p>
          <HomeSectionManager sections={sectionsDraft} onChange={setSectionsAndClearNotice} />
        </div>
      )}

      {!isSite && device === 'desktop' && (
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

      {!isSite && device === 'mobile' && (
        <div className="mt-6 max-w-2xl">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Mobile tab bar</h3>
          <p className="text-[11px] text-muted mb-2">
            Rename, reorder, add, or remove the tabs along the bottom of the screen. Desktop has no
            tab bar — it navigates by the section tabs above instead.
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
