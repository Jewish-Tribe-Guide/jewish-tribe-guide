'use client'

import { useCallback, useEffect, useState } from 'react'
import type { SiteSettings } from '@/lib/siteSettings'
import type { HomeSection, DraftHomeSection } from '@/lib/homeSections'
import { saveHomeSections } from '@/lib/homeSectionsDraft'
import SiteSettingsPreview from './SiteSettingsPreview'
import HomeSectionManager from './HomeSectionManager'

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

export default function SiteSettingsEditor({ token }: { token: string }) {
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
    return <SiteSettingsPreview settings={draft} sections={sectionsDraft} onClose={closePreview} />
  }

  const dirty =
    !settings || JSON.stringify(settings) !== JSON.stringify(draft) || !sections || !sectionsEqual(sections, sectionsDraft)

  return (
    <div>
      <p className="text-sm text-muted mb-4">
        The site name, tagline, logo, home screen heading and mission, the sections on the home
        screen, and the feedback form — laid out in the order they appear on the page. Nothing here
        goes live until you click Save changes below.
      </p>

      {error && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{error}</p>
      )}

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

      <div className="mt-6 max-w-2xl">
        <h3 className="text-sm font-semibold text-slate-800 mb-1">Home page sections</h3>
        <HomeSectionManager sections={sectionsDraft} onChange={setSectionsAndClearNotice} />
      </div>

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

      <p className="text-[11px] text-muted mt-5 max-w-xl">
        These also drive the browser tab title, search-engine description, and “Add to Home Screen”
        app name.
      </p>
    </div>
  )
}
