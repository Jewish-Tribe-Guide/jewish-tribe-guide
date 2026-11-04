'use client'

import { useState } from 'react'
import { BUILT_IN_BLOCKS, type DraftHomeSection, type HomeBlockKind } from '@/lib/homeSections'
import type { SiteSettings } from '@/lib/siteSettings'
import SubscriberManager from './SubscriberManager'
import DragList, { OrderRow, rowButton } from './DragList'

// ── The desktop home screen's five singleton cards — Categories & Search,
// Davening Times, Update Listings, Email Signup, and Jewish Times —
// reorderable and removable, same shared draft/Save pipeline as
// HomeSectionManager's category sections (see homeSectionsDraft.ts). Each
// row is labeled by its fixed admin name (CARD_META below), not a
// renameable "title" the way the old 'featured'/'map'/'zmanim' blocks were
// — none of the five has a live-rendered `title` any more (see
// homeSections.ts's own doc); every one has its own dedicated eyebrow/
// heading fields in SiteSettings instead, edited inline on its own row here.
// 'map' used to be a sixth card here (the map embedded on the home screen) —
// retired, the user's own call: the map only ever lives at its own
// full-screen route now. Not offered here any more, so no admin can add it
// back; Landing.tsx silently renders nothing for a leftover 'map' row, same
// as any other retired kind (see BUILT_IN_BLOCKS's own doc).
//
// Lives under the Desktop tab, not the Site tab's plain "Home page
// sections": mobile never shows any of these five (see Landing.tsx — all
// five are desktop-only), so they belong with the other desktop-only
// settings, not mixed in with the cross-device category-section list.
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
  /** Absent when the card's title is fixed on the site. */
  headingKey?: keyof SiteSettings
  /** Davening Times and Update Listings always share one row with Suggest a
   *  Listing, so their width does nothing. */
  sharedRow?: true
}

// Order here is just documentation, same as BUILT_IN_BLOCKS — actual
// display order always comes from sortOrder (topicEntries below).
const CARD_META: CardMeta[] = [
  {
    kind: 'browse',
    description: 'A tile per category',
  },
  {
    kind: 'davening',
    description: 'The next minyan, beside the listings card',
    sharedRow: true,
  },
  {
    kind: 'listings',
    description: 'Add, edit or report a listing, beside the davening card',
    eyebrowKey: 'desktopListingsEyebrow',
    headingKey: 'desktopListingsHeading',
    sharedRow: true,
  },
  {
    kind: 'subscribe',
    description: 'Email sign-up',
    eyebrowKey: 'desktopSubscribeEyebrow',
    headingKey: 'desktopSubscribeHeading',
  },
  {
    kind: 'jewishTimes',
    description: 'This week’s candle lighting, when there’s a Zmanim category',
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
  token,
  onOpenCard,
}: {
  sections: DraftHomeSection[]
  onChange: (sections: DraftHomeSection[]) => void
  /** The draft SiteSettings — read-only here, for each card's own
   *  eyebrow/heading values. */
  settings: SiteSettings
  /** SiteSettingsEditor's own `set` function — writes one field onto its
   *  draft, same as every other input on that page. */
  onSettingChange: <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => void
  /** For the email sign-up card's list of who signed up; without it the
   *  list isn't shown. */
  token?: string
  /** A row opened, or null when closed: the preview lights that card up. */
  onOpenCard?: (kind: string | null) => void
}) {
  // The home page's cards, in order, as rows (board 7): a row opens in
  // place to its words, width and order; taking one off asks once.
  const [openId, setOpenId] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const cardEntries = sections.filter(
    (s): s is DraftHomeSection & { kind: CardKind } => s.kind !== 'section' && CARD_KIND_SET.has(s.kind),
  )
  const sectionEntries = sections.filter((s) => s.kind === 'section')
  const legacyEntries = sections.filter((s) => s.kind !== 'section' && !CARD_KIND_SET.has(s.kind))
  const missingCards = CARD_KINDS.filter((k) => !cardEntries.some((c) => c.kind === k))

  // What a visitor sees it called: its heading, or the card's name.
  function labelOf(kind: CardKind) {
    const meta = CARD_META_BY_KIND.get(kind)
    return (meta?.headingKey && (settings[meta.headingKey] as string)) || BUILT_IN_BLOCKS[kind].title.replace(/ Card$/, '')
  }

  function addCard(kind: CardKind) {
    const b = BUILT_IN_BLOCKS[kind]
    onChange([
      ...sectionEntries,
      ...legacyEntries,
      ...cardEntries,
      { id: b.id, kind, title: b.title, cardIds: [], width: 'full' },
    ])
  }

  function removeCard(id: string) {
    setRemoving(null)
    setOpenId(null)
    onChange(sections.filter((s) => s.id !== id))
  }

  function setWidth(id: string, width: 'full' | 'half') {
    onChange(sections.map((s) => (s.id === id ? { ...s, width } : s)))
  }

  function reorderCards(next: typeof cardEntries) {
    onChange([...sectionEntries, ...legacyEntries, ...next])
  }

  const quiet = 'min-h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer'

  return (
    <div>
      {/* Dragged by the handle, or held on a phone (note 25). */}
      <DragList items={cardEntries} keyOf={(c) => c.id} nameOf={(c) => labelOf(c.kind)} onReorder={reorderCards}>
        {(c, row) => {
          const meta = CARD_META_BY_KIND.get(c.kind)
          const label = labelOf(c.kind)
          const open = openId === c.id
          return (
            <OrderRow
              row={row}
              name={label}
              line={meta?.description}
              open={open}
              onToggle={() => {
                setOpenId(open ? null : c.id)
                onOpenCard?.(open ? null : c.kind)
              }}
            >
              {meta?.headingKey && (
                <div className={`grid grid-cols-1 gap-2 ${meta.eyebrowKey ? 'sm:grid-cols-2' : ''}`}>
                  {meta.eyebrowKey && (
                    <label className="block">
                      <span className="block text-[13px] font-semibold text-slate-700 mb-1">Small line above</span>
                      <input
                        value={settings[meta.eyebrowKey] as string}
                        onChange={(e) => onSettingChange(meta.eyebrowKey!, e.target.value as SiteSettings[typeof meta.eyebrowKey])}
                        className={inputClass}
                      />
                    </label>
                  )}
                  <label className="block">
                    <span className="block text-[13px] font-semibold text-slate-700 mb-1">Heading</span>
                    <input
                      value={settings[meta.headingKey!] as string}
                      onChange={(e) => onSettingChange(meta.headingKey!, e.target.value as SiteSettings[NonNullable<typeof meta.headingKey>])}
                      className={inputClass}
                    />
                  </label>
                </div>
              )}
              {c.kind === 'subscribe' && token && <SubscriberManager token={token} />}
              {removing === c.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="m-0 flex-1 text-sm font-semibold text-slate-900">Take {label} off the home page?</p>
                  <button type="button" onClick={() => removeCard(c.id)} className="min-h-10 px-3 rounded-lg bg-red-600 text-white text-sm font-semibold cursor-pointer">
                    Take it off
                  </button>
                  <button type="button" onClick={() => setRemoving(null)} className={quiet}>
                    Leave it
                  </button>
                </div>
              ) : (
                // The width and Take it off on one line (the user, Nov 4).
                <div className="flex items-center gap-2.5">
                  {!meta?.sharedRow && (
                    <div role="group" aria-label="Width" className="inline-flex gap-0.5 rounded-lg border border-slate-300 p-0.5">
                      {(['full', 'half'] as const).map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setWidth(c.id, w)}
                          aria-pressed={c.width === w}
                          className={`min-h-9 px-2.5 sm:px-3 text-[13px] font-semibold rounded-md cursor-pointer ${
                            c.width === w ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {w === 'full' ? 'Full width' : 'Half width'}
                        </button>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={() => setRemoving(c.id)} className={rowButton}>
                    Take it off
                  </button>
                </div>
              )}
              {!meta?.sharedRow && c.width === 'half' && removing !== c.id && (
                <p className="m-0 text-[13px] text-slate-600">Sits beside the next half-width card.</p>
              )}
            </OrderRow>
          )
        }}
      </DragList>

      {missingCards.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-slate-100">
          {missingCards.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => addCard(k)}
              className="min-h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-primary hover:bg-slate-50 cursor-pointer"
            >
              + Add “{BUILT_IN_BLOCKS[k].title}”
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
