'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import type { SiteSettings } from '@/lib/siteSettings'
import type { HomeSection, DraftHomeSection } from '@/lib/homeSections'
import { saveHomeSections } from '@/lib/homeSectionsDraft'
import { useActiveCommunity } from '@/lib/communityContext'
import { useAdminApi } from './useAdminApi'
import { parseOkJson } from '@/lib/fetchJson'
import { adminBase } from '@/lib/adminNav'
import DesktopTopicsManager, { withoutCard } from './DesktopTopicsManager'
import RightNowScreen, { ScreenHeader, inHomeOrder, rightNowSummary, useRightNowData } from './RightNowScreen'
import { useStepsInAddress } from './useStepsInAddress'
import DesktopNavEditor from './DesktopNavEditor'
import MobileTabsEditor from './MobileTabsEditor'
import SitePreview, { type PreviewDevice } from './SitePreview'
import DevicePreviewFrame from './DevicePreviewFrame'
import { previewUrl, writePreviewDraft } from '@/lib/previewDraft'
import { PREVIEW_DAY_WORDS, type PreviewDay } from '@/lib/previewDay'
import SaveBar, { useLeaveGuard } from './SaveBar'
import { AdminBox, AdminField, AdminPreviewButton, adminInputClass } from './AdminUI'
import { features } from '@/lib/features'
import { useIsDesktop } from '@/lib/useIsMobile'
import ImageUploadField from '@/components/ImageUploadField'
import { DEFAULT_MOBILE_TABS, MAX_BEFORE_CANDLE_ITEMS, TODAY_BLOCKS } from '@/lib/siteSettings'

// Site's Home page (the drawing 2sssenojcQzzeHtHAT8gnp): the home page and
// the header over it, each named by what a visitor sees, with the page itself
// in a small preview beside them. Computer or Phone at the top picks which
// the boxes and the preview are of, in the order the page reads; a box on
// both says so. It used to be two tabs, Home page and Header and menus, which
// left Home page nearly all computer and the header's tab previewing the same
// home page (the user, Nov 4). Nothing goes live until Save.

function sectionsEqual(a: DraftHomeSection[], b: DraftHomeSection[]): boolean {
  // Every field saveHomeSections actually persists (see its own `changed()`)
  // has to be listed here too — a card's width was once left out, so
  // changing it never marked the form dirty.
  const strip = (s: DraftHomeSection[]) => s.map(({ id, title, cardIds, sharesRow }) => ({ id, title, cardIds, sharesRow }))
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

type CardScreen = 'rightNow' | 'map'

export default function SiteSettingsEditor({ token }: { token: string }) {
  const { community } = useActiveCommunity()
  const api = useAdminApi(token)
  // Which version of the page the boxes and the preview are of.
  const [device, setDevice] = useState<PreviewDevice>('computer')
  // The day the preview shows Right now on, picked on Right Now's screen
  // (previewDay.ts); null for now. Kept while on Home page, never saved.
  const [previewDay, setPreviewDay] = useState<PreviewDay | null>(null)
  const [settings, setSettings] = useState<SiteSettings | null>(null)
  const [draft, setDraft] = useState<SiteSettings | null>(null)
  const [sections, setSections] = useState<HomeSection[] | null>(null)
  const [sectionsDraft, setSectionsDraft] = useState<DraftHomeSection[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  // The preview beside shows from lg up; narrower, it isn't loaded at all.
  // Hidden, it still loaded the whole home page, and again after each edit
  // (the user, Nov 5: on an iPhone the page kept jumping back to the top).
  const roomy = useIsDesktop('(max-width: 1023px)')
  // The full-size preview has its own history entry, as Category pages' and
  // Forms' do, so browser Back closes it rather than leaving the page, and
  // Forward opens it again (the user, Nov 4). Forward shows what's typed
  // now, not what was typed when it was first opened. In the address as
  // ?preview=open, so a reload stays on it (Nov 18: it was an entry pushed
  // behind Next's router, with nothing in the address).
  const shownDraft = useRef<Parameters<typeof writePreviewDraft>[0] | null>(null)
  useStepsInAddress('preview', previewing ? ['open'] : [], ([to]) => {
    if (to === 'open' && shownDraft.current) writePreviewDraft(shownDraft.current)
    setPreviewing(to === 'open')
  })
  useEffect(() => {
    shownDraft.current = draft && sectionsDraft ? { settings: draft, sections: sectionsDraft } : null
  }, [draft, sectionsDraft])
  // Reopened by a reload before the boxes had loaded: what it shows is
  // written once they have (the preview below waits for them too).
  const previewOpen = previewing && !!draft && !!sectionsDraft
  useEffect(() => {
    if (previewOpen && shownDraft.current) writePreviewDraft(shownDraft.current)
  }, [previewOpen])
  // The box being worked on, which the preview lights up.
  const [spot, setSpot] = useState<string | null>(null)
  const spotOn = (name: string | null) => ({ onMouseEnter: () => setSpot(name), onFocusCapture: () => setSpot(name) })
  // ImageUploadField's memory of "the real original behind `value`", kept
  // here so it survives the field unmounting when Computer or Phone changes.
  const [heroOriginal, setHeroOriginal] = useState<File | string | null>(null)
  const [logoOriginal, setLogoOriginal] = useState<File | string | null>(null)
  const [mapOriginal, setMapOriginal] = useState<File | string | null>(null)
  // A card's own screen (boards V4/V4b, Nov 15), in the address as
  // ?card=rightNow, so Back returns to the list and a reload stays on it.
  const [cardScreen, setCardScreen] = useState<CardScreen | null>(null)
  useStepsInAddress('card', cardScreen ? [cardScreen] : [], ([to]) => setCardScreen(to === 'rightNow' || to === 'map' ? to : null))
  const rightNowLoaded = useRightNowData(community.slug)
  const rightNowData = rightNowLoaded && sectionsDraft ? inHomeOrder(rightNowLoaded, sectionsDraft) : null

  // `api` is kept across a new token (hourly, useAdminApi), so the draft
  // isn't loaded again over what's being typed.
  const load = useCallback(async () => {
    setError(null)
    try {
      const [settingsRes, sectionsRes] = await Promise.all([
        api.fetch('/api/admin/site-settings'),
        api.fetch('/api/admin/home-sections'),
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
  }, [api])

  useLoadOnMount(load)

  const changes = settings && draft && sections && sectionsDraft ? countChanges(settings, draft, sections, sectionsDraft) : 0
  const base = adminBase(community.slug)
  const stays = useCallback((path: string) => path === `${base}/home`, [base])
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
      // Only what changed here: Forms saves the feedback form on its own,
      // and this draft may hold what it had before it saved.
      const changed = changedSettings(settings, draft)
      if (Object.keys(changed).length > 0) {
        const body = await api.send<{ settings: SiteSettings }>('PATCH', '/api/admin/site-settings', changed, 'Save failed.')
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
  // hasn't been saved (board 21c), on the version picked.
  if (previewing) {
    return <DevicePreviewFrame src={previewUrl(community.slug)} initialDevice={device === 'phone' ? 'mobile' : 'desktop'} onClose={() => setPreviewing(false)} />
  }

  const openPreview = () => {
    writePreviewDraft({ settings: draft, sections: sectionsDraft, day: previewDay })
    setPreviewing(true)
  }

  const computer = device === 'computer'
  // On a box that shows on both versions.
  const alsoOn = <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">{computer ? 'Also on a phone' : 'Also on a computer'}</span>

  const nameAndLogo = (
    <div {...spotOn(null)}>
      <AdminBox title="Name and logo" action={alsoOn}>
        <div className="flex flex-col gap-4 p-4">
          <AdminField label="Name">
            <input value={draft.name} onChange={(e) => set('name', e.target.value)} className={adminInputClass} />
          </AdminField>
          <div>
            <span className="block text-[13px] font-semibold text-slate-700 mb-1.5">Logo</span>
            <ImageUploadField
              value={draft.logoUrl ?? ''}
              onChange={(url) => set('logoUrl', url || null)}
              uploadUrl={api.url('/api/admin/site-settings/logo')}
              token={token}
              shape="square"
              // As a listing's photo (the user, Nov 4): no hint, the address
              // behind a "Paste URL" button.
              showRepositionHint={false}
              collapseUrlInput
              originalSource={logoOriginal}
              onOriginalSourceChange={setLogoOriginal}
            />
          </div>
        </div>
      </AdminBox>
    </div>
  )

  const searchBox = (
    <div {...spotOn('top')}>
      <AdminBox title="Search box" action={alsoOn}>
        <div className="p-4">
          <input aria-label="Words in the search box" value={draft.searchPlaceholder} onChange={(e) => set('searchPlaceholder', e.target.value)} className={adminInputClass} />
        </div>
      </AdminBox>
    </div>
  )

  const cardOn = (kind: string) => sectionsDraft.find((x) => x.kind === kind)
  const takeOff = (kind: string) => {
    const card = cardOn(kind)
    if (card) setHomeSections(withoutCard(sectionsDraft, card.id))
    setCardScreen(null)
  }
  const rightNowScreen = (
    <div {...spotOn('card-rightNow')}>
      <RightNowScreen
        data={rightNowData}
        chosen={draft.rightNowCategories}
        onChoose={(ids) => set('rightNowCategories', ids)}
        items={draft.beforeCandleItems}
        onItems={(items) => set('beforeCandleItems', items)}
        onBack={() => setCardScreen(null)}
        onRemove={computer && cardOn('rightNow') ? () => takeOff('rightNow') : undefined}
        day={previewDay}
        onDay={setPreviewDay}
      />
    </div>
  )
  const mapScreen = (
    <section data-testid="map-card-screen" aria-label="Map" className="overflow-hidden rounded-2xl border border-slate-200 bg-white" {...spotOn('card-map')}>
      <ScreenHeader title="Map" onBack={() => setCardScreen(null)} onRemove={cardOn('map') ? () => takeOff('map') : undefined} />
      <div className="p-5">
        {/* The map card's photo (board G3), on the card's own screen (V4). */}
        <span className="block text-[13px] font-semibold text-slate-700 mb-1.5">Photo</span>
        <ImageUploadField
          value={draft.desktopMapImage?.url ?? ''}
          onChange={(url) => set('desktopMapImage', url ? { url, alt: '' } : null)}
          uploadUrl={api.url('/api/admin/site-settings/hero-image')}
          token={token}
          shape="square"
          aspect={26 / 15}
          showRepositionHint={false}
          collapseUrlInput
          originalSource={mapOriginal}
          onOriginalSourceChange={setMapOriginal}
        />
      </div>
    </section>
  )
  const cardOpens = {
    rightNow: { summary: rightNowSummary(rightNowData, draft.rightNowCategories), onOpen: () => setCardScreen('rightNow') },
    map: { summary: draft.desktopMapImage ? 'Photo' : 'No photo', onOpen: () => setCardScreen('map') },
  }
  // The Map card is the computer's only; Right now is on both homes.
  const openScreen = cardScreen === 'rightNow' ? rightNowScreen : cardScreen === 'map' && computer ? mapScreen : null

  return (
    <div className="flex flex-col gap-4">
      {/* Full width on a phone, like the Preview button under it (the user,
          Nov 4); beside the boxes on a computer, as drawn. */}
      <div role="group" aria-label="Show the page on" className="flex lg:self-start lg:inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
        {(['computer', 'phone'] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={device === d}
            onClick={() => setDevice(d)}
            className={`flex-1 lg:flex-none min-h-10 px-4 rounded-md text-sm font-semibold cursor-pointer ${device === d ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
          >
            {d === 'computer' ? 'Computer' : 'Phone'}
          </button>
        ))}
      </div>
      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <div className="lg:hidden">
            <AdminPreviewButton onClick={openPreview} />
          </div>
          {openScreen ?? (
          <>
          {nameAndLogo}
          {computer ? (
            <>
              <div {...spotOn(null)}>
                <AdminBox title="Header">
                  <DesktopNavEditor
                    items={draft.desktopNavItems}
                    onChange={(items) => set('desktopNavItems', items)}
                    sections={sectionsDraft}
                    onSectionsChange={setHomeSections}
                  />
                </AdminBox>
              </div>

              <div {...spotOn('top')}>
                <AdminBox title="Top of the page">
                  <div className="flex flex-col gap-4 p-4">
                    <AdminField label="Big line">
                      <input value={draft.desktopHeroHeadline} onChange={(e) => set('desktopHeroHeadline', e.target.value)} className={adminInputClass} />
                    </AdminField>
                    {/* No line under it: the big line, then the search (the
                        user, Nov 11). */}
                    {/* No description: the photo is decoration (HeroHeading). */}
                    <div>
                      <span className="block text-[13px] font-semibold text-slate-700 mb-1.5">Photo</span>
                      <ImageUploadField
                        value={draft.desktopHeroImage?.url ?? ''}
                        onChange={(url) => set('desktopHeroImage', url ? { url, alt: '' } : null)}
                        uploadUrl={api.url('/api/admin/site-settings/hero-image')}
                        token={token}
                        shape="square"
                        aspect={11 / 6}
                        showRepositionHint={false}
                        collapseUrlInput
                        originalSource={heroOriginal}
                        onOriginalSourceChange={setHeroOriginal}
                      />
                    </div>
                  </div>
                </AdminBox>
              </div>

              {searchBox}

              <div {...spotOn('cards')}>
                <AdminBox title="Cards under the search">
                  <DesktopTopicsManager
                    sections={sectionsDraft}
                    onChange={setHomeSections}
                    settings={draft}
                    onPointCard={(kind) => setSpot(kind ? `card-${kind}` : 'cards')}
                    opens={cardOpens}
                  />
                </AdminBox>
              </div>
            </>
          ) : (
            <>
              {searchBox}

              {/* The phone home always has Right now, under the search. */}
              <div {...spotOn('card-rightNow')}>
                <AdminBox title="Under the search">
                  <div className="p-3">
                    <button
                      type="button"
                      onClick={cardOpens.rightNow.onOpen}
                      className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-left hover:border-primary"
                    >
                      <span className="flex-1 text-[15px] font-medium text-slate-900">Right Now</span>
                      {cardOpens.rightNow.summary && <span className="truncate text-[14px] text-muted">{cardOpens.rightNow.summary}</span>}
                      <svg width="9" height="15" viewBox="0 0 9 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-slate-400">
                        <path d="M1.5 1.5l6 6-6 6" />
                      </svg>
                    </button>
                  </div>
                </AdminBox>
              </div>

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

              {/* No count beside the title (the user, Nov 4); five at most says so when it's reached. */}
              <div {...spotOn(null)}>
                <AdminBox title="Tabs">
                  <MobileTabsEditor tabs={draft.mobileTabs ?? DEFAULT_MOBILE_TABS} onChange={(tabs) => set('mobileTabs', tabs)} />
                </AdminBox>
              </div>
            </>
          )}
          </>
          )}
        </div>

        <aside aria-label="Preview" className="hidden lg:block shrink-0 sticky top-8">
          {roomy && previewDay && (
            // Which day it shows, when it isn't now, and the way back to now.
            <p className="m-0 mb-2 flex items-center gap-1 text-sm font-semibold text-slate-900">
              <span className="rounded-full bg-primary/10 py-1 pl-3 pr-1 text-primary">
                Showing {PREVIEW_DAY_WORDS[previewDay].replace(/^A /, 'a ')}
                <button type="button" aria-label="Back to now" onClick={() => setPreviewDay(null)} className="ml-1 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full hover:bg-primary/15">
                  ×
                </button>
              </span>
            </p>
          )}
          {roomy && <SitePreview community={community.slug} settings={draft} sections={sectionsDraft} device={device} spot={spot} onOpen={openPreview} day={previewDay} />}
        </aside>
      </div>

      <SaveBar changes={changes} saving={saving} saved={saved} error={draft ? error : null} onUndo={undo} onSave={save} />
    </div>
  )
}
