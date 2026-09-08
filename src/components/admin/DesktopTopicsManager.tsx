'use client'

import { BUILT_IN_BLOCKS, type DraftHomeSection, type HomeBlockKind } from '@/lib/homeSections'
import type { SiteSettings } from '@/lib/siteSettings'

// ── The desktop home screen's six singleton cards — Categories & Search,
// Davening Times, Update Listings, Map, Email Signup, and Jewish Times —
// reorderable and removable, same shared draft/Save pipeline as
// HomeSectionManager's category sections (see homeSectionsDraft.ts). Each
// row is labeled by its fixed admin name (CARD_META below), not a
// renameable "title" the way the old 'featured'/'map'/'zmanim' blocks were
// — none of the six has a live-rendered `title` any more (see
// homeSections.ts's own doc); every one has its own dedicated eyebrow/
// heading fields in SiteSettings instead, edited inline on its own row here.
//
// Lives under the Desktop tab, not the Site tab's plain "Home page
// sections": mobile never shows any of these six (see Landing.tsx — all six
// are desktop-only), so they belong with the other desktop-only settings,
// not mixed in with the cross-device category-section list.
//
// `sections` (the draft prop) actually holds every home_section row —
// carefully only ever reads/reorders the kind!=='section' subset here,
// leaving any plain category sections in the draft untouched (see
// cardEntries/sectionEntries below) — HomeSectionManager owns those. ──────

type CardKind = Exclude<HomeBlockKind, 'section'>

type CardMeta = {
  kind: CardKind
  description: string
  eyebrowKey?: keyof SiteSettings
  headingKey: keyof SiteSettings
}

// Order here is just documentation, same as BUILT_IN_BLOCKS — actual
// display order always comes from sortOrder (topicEntries below).
const CARD_META: CardMeta[] = [
  {
    kind: 'browse',
    description: 'The always-first search box + flat category grid.',
    eyebrowKey: 'desktopBrowseEyebrow',
    headingKey: 'desktopBrowseHeading',
  },
  {
    kind: 'davening',
    description: 'Today’s next davening time, aggregated across every category with minyanim.',
    eyebrowKey: 'desktopDaveningEyebrow',
    headingKey: 'desktopDaveningHeading',
  },
  {
    kind: 'listings',
    description: 'The Add/Edit/Report card — the actions that actually keep listings current.',
    eyebrowKey: 'desktopListingsEyebrow',
    headingKey: 'desktopListingsHeading',
  },
  {
    kind: 'map',
    description: 'The map, embedded directly on the home screen.',
    eyebrowKey: 'desktopMapEyebrow',
    headingKey: 'desktopMapHeading',
  },
  {
    kind: 'subscribe',
    description: 'The email-subscribe form — new listings and closures, by category.',
    eyebrowKey: 'desktopSubscribeEyebrow',
    headingKey: 'desktopSubscribeHeading',
  },
  {
    kind: 'jewishTimes',
    description:
      'Candle lighting, havdalah, and upcoming Yom Tov. Renders only when a Zmanim category is configured. No eyebrow field — its own eyebrow is the computed Hebrew date + location, not static text.',
    headingKey: 'desktopJewishTimesHeading',
  },
]
const CARD_META_BY_KIND = new Map(CARD_META.map((m) => [m.kind, m]))
const CARD_KINDS = CARD_META.map((m) => m.kind)
const CARD_KIND_SET = new Set<string>(CARD_KINDS)

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

export default function DesktopTopicsManager({
  sections,
  onChange,
  settings,
  onSettingChange,
}: {
  sections: DraftHomeSection[]
  onChange: (sections: DraftHomeSection[]) => void
  /** The draft SiteSettings — read-only here, for each card's own
   *  eyebrow/heading values. */
  settings: SiteSettings
  /** SiteSettingsEditor's own `set` function — writes one field onto its
   *  draft, same as every other input on that page. */
  onSettingChange: <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => void
}) {
  const cardEntries = sections.filter(
    (s): s is DraftHomeSection & { kind: CardKind } => s.kind !== 'section' && CARD_KIND_SET.has(s.kind),
  )
  // Left exactly as they are in every onChange call below — HomeSectionManager
  // owns reordering/renaming/removing plain sections, not this component.
  const sectionEntries = sections.filter((s) => s.kind === 'section')
  // A row whose kind predates the current six (e.g. the old 'zmanim'/
  // 'shabbat'/'featured' — DDL here only ever widens the DB's allowed kinds,
  // never narrows, so an existing row like that can still be sitting in a
  // real community's data). CARD_META has nothing to show for it —
  // BUILT_IN_BLOCKS[kind] would be undefined — so it's left alone,
  // untouched by every onChange below, same as sectionEntries. It simply
  // isn't rendered here (Landing.tsx's own ordered walk already has no
  // branch for it either) until reseeded or removed by hand in the
  // database.
  const legacyEntries = sections.filter((s) => s.kind !== 'section' && !CARD_KIND_SET.has(s.kind))
  const missingCards = CARD_KINDS.filter((k) => !cardEntries.some((c) => c.kind === k))

  function addCard(kind: CardKind) {
    const b = BUILT_IN_BLOCKS[kind]
    onChange([...sectionEntries, ...legacyEntries, ...cardEntries, { id: b.id, kind, title: b.title, cardIds: [] }])
  }

  function removeCard(id: string, label: string) {
    if (!confirm(`Remove "${label}" from the home page? You can add it back anytime with the button below.`)) return
    onChange(sections.filter((s) => s.id !== id))
  }

  function moveCard(index: number, dir: -1 | 1) {
    const other = index + dir
    if (other < 0 || other >= cardEntries.length) return
    const reordered = [...cardEntries]
    ;[reordered[index], reordered[other]] = [reordered[other], reordered[index]]
    onChange([...sectionEntries, ...legacyEntries, ...reordered])
  }

  return (
    <div>
      <p className="text-sm text-muted mb-4">
        The desktop home screen&rsquo;s cards, in order — reorder or remove one entirely, and edit its
        own eyebrow/heading right on its row. Mobile doesn&rsquo;t show these (it has its own tab bar
        instead). Part of this tab&rsquo;s Save changes below — nothing here goes live until you save.
      </p>

      {cardEntries.length > 0 && (
        <div className="space-y-3 max-w-2xl">
          {cardEntries.map((c, i) => {
            const meta = CARD_META_BY_KIND.get(c.kind)
            const label = BUILT_IN_BLOCKS[c.kind].title
            return (
              <div key={c.id} className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <p className="pt-0.5 text-sm font-medium text-slate-800">{label}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => moveCard(i, -1)} disabled={i === 0} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer px-1" aria-label={`Move ${label} up`}>↑</button>
                    <button onClick={() => moveCard(i, 1)} disabled={i === cardEntries.length - 1} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer px-1" aria-label={`Move ${label} down`}>↓</button>
                    <button onClick={() => removeCard(c.id, label)} className="text-xs text-red-600 hover:underline cursor-pointer ml-2">Remove</button>
                  </div>
                </div>
                {meta && <p className="text-xs text-muted mb-2">{meta.description}</p>}
                {meta && (
                  <div className={`grid grid-cols-1 gap-2 mt-2 ${meta.eyebrowKey ? 'sm:grid-cols-2' : ''}`}>
                    {meta.eyebrowKey && (
                      <label className="block">
                        <span className="block text-[11px] font-medium text-slate-600 mb-1">Eyebrow</span>
                        <input
                          value={settings[meta.eyebrowKey] as string}
                          onChange={(e) => onSettingChange(meta.eyebrowKey!, e.target.value as SiteSettings[typeof meta.eyebrowKey])}
                          className={inputClass}
                        />
                      </label>
                    )}
                    <label className="block">
                      <span className="block text-[11px] font-medium text-slate-600 mb-1">Heading</span>
                      <input
                        value={settings[meta.headingKey] as string}
                        onChange={(e) => onSettingChange(meta.headingKey, e.target.value as SiteSettings[typeof meta.headingKey])}
                        className={inputClass}
                      />
                    </label>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {missingCards.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 max-w-2xl">
          {missingCards.map((k) => (
            <button
              key={k}
              onClick={() => addCard(k)}
              className="text-xs font-medium border border-slate-300 rounded-full px-3 py-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              + Add “{BUILT_IN_BLOCKS[k].title}”
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
