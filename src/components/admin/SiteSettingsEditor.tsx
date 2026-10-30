'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import type { SiteSettings } from '@/lib/siteSettings'
import type { HomeSection, DraftHomeSection } from '@/lib/homeSections'
import { saveHomeSections } from '@/lib/homeSectionsDraft'
import { useActiveCommunity } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { adminBase } from '@/lib/adminNav'
import HomeSectionManager from './HomeSectionManager'
import DesktopTopicsManager from './DesktopTopicsManager'
import DesktopNavEditor from './DesktopNavEditor'
import MobileTabsEditor from './MobileTabsEditor'
import SitePreview from './SitePreview'
import DevicePreviewFrame from './DevicePreviewFrame'
import { previewUrl, writePreviewDraft } from '@/lib/previewDraft'
import SaveBar, { useLeaveGuard } from './SaveBar'
import { AdminBox, AdminField, AdminPreviewButton, adminInputClass } from './AdminUI'
import { features } from '@/lib/features'
import ImageUploadField from '@/components/ImageUploadField'
import { DEFAULT_MOBILE_TABS, MAX_BEFORE_CANDLE_ITEMS, TODAY_BLOCKS } from '@/lib/siteSettings'

// Site's Home page and Header and menus tabs (the admin redesign's step 4,
// boards 7 and 8): the settings sorted by the screen they change, not by
// device, each named by what a visitor sees, with the screen itself in a
// small preview beside them. Both tabs are one component instance sharing
// one draft and one Save bar (see SiteSettingsLayout), so stepping between
// them never drops a half-finished edit. Nothing goes live until Save.

function sectionsEqual(a: DraftHomeSection[], b: DraftHomeSection[]): boolean {
  // Every field saveHomeSections actually persists (see its own `changed()`)
  // has to be listed here too — width was once left out, so flipping a
  // card's Full/Half toggle never marked the form dirty.
  const strip = (s: DraftHomeSection[]) => s.map(({ id, title, cardIds, width }) => ({ id, title, cardIds, width }))
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b))
}

/** How many things the Save bar says changed: each setting, and the
 *  home page's sections as one. */
export function countChanges(
  saved: SiteSettings,
  draft: SiteSettings,
  sections: DraftHomeSection[],
  sectionsDraft: DraftHomeSection[],
): number {
  const keys = Object.keys(draft) as (keyof SiteSettings)[]
  const settings = keys.filter((k) => JSON.stringify(saved[k]) !== JSON.stringify(draft[k])).length
  return settings + (sectionsEqual(sections, sectionsDraft) ? 0 : 1)
}

/** The settings the draft changes, and nothing else. */
export function changedSettings(saved: SiteSettings, draft: SiteSettings): Partial<SiteSettings> {
  const keys = Object.keys(draft) as (keyof SiteSettings)[]
  return Object.fromEntries(keys.filter((k) => JSON.stringify(saved[k]) !== JSON.stringify(draft[k])).map((k) => [k, draft[k]]))
}

/** The items as one line, "Challah, Wine, Chicken". What was typed stays
 *  while it still says the same list, so a comma or a space isn't swallowed
 *  mid-word; after an Undo or a save it's the list again. */
function BeforeCandleItemsInput({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  const [typed, setTyped] = useState(items.join(', '))
  const parsed = (t: string) => t.split(',').map((i) => i.trim()).filter(Boolean).slice(0, MAX_BEFORE_CANDLE_ITEMS)
  const shown = JSON.stringify(parsed(typed)) === JSON.stringify(items) ? typed : items.join(', ')
  return (
    <input
      value={shown}
      onChange={(e) => {
        setTyped(e.target.value)
        onChange(parsed(e.target.value))
      }}
      className={adminInputClass}
    />
  )
}

export default function SiteSettingsEditor({
  token,
  section,
}: {
  token: string
  /** Which tab is showing: the Home page, or Header and menus. */
  section: 'home' | 'menus'
}) {
  const { community } = useActiveCommunity()
  const [settings, setSettings] = useState<SiteSettings | null>(null)
  const [draft, setDraft] = useState<SiteSettings | null>(null)
  const [sections, setSections] = useState<HomeSection[] | null>(null)
  const [sectionsDraft, setSectionsDraft] = useState<DraftHomeSection[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  // ImageUploadField's memory of "the real original behind `value`", kept
  // here so it survives the field unmounting when the tab switches (this
  // component stays mounted across both tabs; the fields don't).
  const [heroOriginal, setHeroOriginal] = useState<File | string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [settingsRes, sectionsRes] = await Promise.all([
        fetch(withCommunity('/api/admin/site-settings', community.slug), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(withCommunity('/api/admin/home-sections', community.slug), { headers: { Authorization: `Bearer ${token}` } }),
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

  const changes = settings && draft && sections && sectionsDraft ? countChanges(settings, draft, sections, sectionsDraft) : 0
  const base = adminBase(community.slug)
  const stays = useCallback((path: string) => path === `${base}/home` || path === `${base}/menus`, [base])
  useLeaveGuard(changes > 0, stays)

  function set<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
    setSaved(false)
  }

  function setHomeSections(next: DraftHomeSection[]) {
    setSectionsDraft(next)
    setSaved(false)
  }

  function undo() {
    setDraft(settings)
    setSectionsDraft(sections)
    setError(null)
  }

  async function save() {
    if (!settings || !draft || !sections || !sectionsDraft) return
    setError(null)
    setSaving(true)
    try {
      // Only what changed here: Forms (the feedback form) and Settings (the
      // name and logo) save their own settings, and this draft may hold
      // what they had before they saved.
      const changed = changedSettings(settings, draft)
      if (Object.keys(changed).length > 0) {
        const body = await fetchJson<{ settings: SiteSettings }>(
          withCommunity('/api/admin/site-settings', community.slug),
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(changed),
          },
          'Save failed.',
        )
        setSettings(body.settings)
        setDraft(body.settings)
      }
      if (!sectionsEqual(sections, sectionsDraft)) {
        const next = await saveHomeSections(token, community.slug, sections, sectionsDraft)
        setSections(next)
        setSectionsDraft(next)
      }
      setSaved(true)
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

  // Narrower than the preview beside needs: the page full size, with what
  // hasn't been saved (board 21c).
  if (previewing) return <DevicePreviewFrame src={previewUrl(community.slug)} onClose={() => setPreviewing(false)} />

  return (
    <div>
      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {section === 'home' ? (
            <>
              <div className="lg:hidden">
                <AdminPreviewButton
                  onClick={() => {
                    writePreviewDraft({ settings: draft, sections: sectionsDraft })
                    setPreviewing(true)
                  }}
                />
              </div>
              <AdminBox title="Top of the page">
                <div className="flex flex-col gap-4 p-4">
                  <AdminField label="Big line">
                    <input value={draft.desktopHeroHeadline} onChange={(e) => set('desktopHeroHeadline', e.target.value)} className={adminInputClass} />
                  </AdminField>
                  <AdminField label="Line under it">
                    <input value={draft.desktopHeroSubhead} onChange={(e) => set('desktopHeroSubhead', e.target.value)} className={adminInputClass} />
                  </AdminField>
                  <AdminField label="Search box">
                    <input value={draft.searchPlaceholder} onChange={(e) => set('searchPlaceholder', e.target.value)} className={adminInputClass} />
                  </AdminField>
                  <div>
                    <span className="block text-[13px] font-semibold text-slate-700 mb-1.5">Photo</span>
                    <ImageUploadField
                      value={draft.desktopHeroImage?.url ?? ''}
                      onChange={(url) => set('desktopHeroImage', url ? { url, alt: draft.desktopHeroImage?.alt ?? '' } : null)}
                      uploadUrl={withCommunity('/api/admin/site-settings/hero-image', community.slug)}
                      token={token}
                      shape="square"
                      aspect={11 / 6}
                      originalSource={heroOriginal}
                      onOriginalSourceChange={setHeroOriginal}
                    />
                  </div>
                  {draft.desktopHeroImage?.url && (
                    <AdminField label="Photo, described">
                      <input
                        value={draft.desktopHeroImage.alt}
                        onChange={(e) => draft.desktopHeroImage && set('desktopHeroImage', { ...draft.desktopHeroImage, alt: e.target.value })}
                        className={adminInputClass}
                      />
                    </AdminField>
                  )}
                </div>
              </AdminBox>

              <AdminBox title="Below it, in this order">
                <DesktopTopicsManager sections={sectionsDraft} onChange={setHomeSections} settings={draft} onSettingChange={set} token={token} />
              </AdminBox>

              <AdminBox title="Category groups">
                <div className="p-4">
                  <HomeSectionManager sections={sectionsDraft} onChange={setHomeSections} />
                </div>
              </AdminBox>

              {/* Held back from the site for now (see features.ts). */}
              {features.todayHome && (
                <AdminBox title="Today home">
                  <div className="flex flex-col gap-4 p-4">
                    <fieldset data-testid="home-style">
                      <legend className="sr-only">Home page</legend>
                      {(
                        [
                          ['classic', 'Classic', 'The search, then every category.'],
                          ['today', 'Today', 'Changes with the day: the next minyan, before candles on Friday, what’s open now.'],
                        ] as const
                      ).map(([value, label, help]) => (
                        <label key={value} className="flex items-start gap-2.5 py-1.5">
                          <input type="radio" name="home-style" value={value} checked={draft.homeStyle === value} onChange={() => set('homeStyle', value)} className="mt-1" />
                          <span>
                            <span className="block text-sm font-medium text-slate-900">{label}</span>
                            <span className="block text-[12px] text-muted">{help}</span>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                    <AdminField label="Before candles looks for">
                      <BeforeCandleItemsInput items={draft.beforeCandleItems} onChange={(items) => set('beforeCandleItems', items)} />
                    </AdminField>
                    <fieldset data-testid="today-blocks">
                      <legend className="block text-[13px] font-semibold text-slate-700 mb-1">On the Today home</legend>
                      {TODAY_BLOCKS.map((block) => (
                        <label key={block.id} className="flex items-start gap-2.5 py-1">
                          <input
                            type="checkbox"
                            checked={!draft.todayHidden.includes(block.id)}
                            onChange={(e) =>
                              set('todayHidden', e.target.checked ? draft.todayHidden.filter((id) => id !== block.id) : [...draft.todayHidden, block.id])
                            }
                            className="mt-1"
                          />
                          <span>
                            <span className="block text-sm font-medium text-slate-900">{block.label}</span>
                            <span className="block text-[12px] text-muted">{block.when}</span>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  </div>
                </AdminBox>
              )}

              <AdminBox title="In link previews and search results">
                <div className="flex flex-col gap-4 p-4">
                  <AdminField label="Title">
                    <input value={draft.heroTitle} onChange={(e) => set('heroTitle', e.target.value)} className={adminInputClass} />
                  </AdminField>
                  <AdminField label="Description">
                    <textarea rows={2} value={draft.mission} onChange={(e) => set('mission', e.target.value)} className={adminInputClass} />
                  </AdminField>
                </div>
              </AdminBox>
            </>
          ) : (
            <>
              <AdminBox title="Top of the page, on a computer">
                <div className="p-4">
                  <DesktopNavEditor items={draft.desktopNavItems} onChange={(items) => set('desktopNavItems', items)} />
                </div>
              </AdminBox>

              <AdminBox title="Tabs, on a phone">
                <div className="p-4">
                  <MobileTabsEditor tabs={draft.mobileTabs ?? DEFAULT_MOBILE_TABS} onChange={(tabs) => set('mobileTabs', tabs)} />
                </div>
              </AdminBox>

            </>
          )}
        </div>

        <aside aria-label="Preview" className="hidden lg:block shrink-0 sticky top-8">
          <SitePreview community={community.slug} settings={draft} sections={sectionsDraft} />
        </aside>
      </div>

      <SaveBar changes={changes} saving={saving} saved={saved} error={draft ? error : null} onUndo={undo} onSave={save} />
    </div>
  )
}
