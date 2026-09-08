'use client'

import { BUILT_IN_BLOCKS, type DraftHomeSection, type HomeBlockKind } from '@/lib/homeSections'

// ── The desktop home screen's singleton "topic" blocks — the Browse/search
// card, Popular right now (the featured-cards row), Explore the map,
// Davening Times + community, and Shabbat Times + Stay in the Loop —
// reorderable, renameable (except Browse/Shabbat, which don't have a single
// heading to rename — see below), and removable, same shared draft/Save
// pipeline as HomeSectionManager's category sections (see
// homeSectionsDraft.ts). Lives under the Desktop tab, not the Site tab's
// plain "Home page sections": mobile never shows any of these (see
// Landing.tsx — all five are desktop-only), so they belong with the other
// desktop-only settings, not mixed in with the cross-device category-section
// list.
//
// `sections` (the draft prop) actually holds every home_section row —
// carefully only ever reads/reorders the kind!=='section' subset here,
// leaving any plain category sections in the draft untouched (see
// topicEntries/sectionEntries below) — HomeSectionManager owns those. ──────

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

const TOPIC_DESCRIPTIONS: Record<Exclude<HomeBlockKind, 'section'>, string> = {
  browse: 'The always-first search box + flat category grid. Its own eyebrow/heading are set above, not here — this row is just its position.',
  featured: 'The three-card row between the search box and the map. Which cards fill it is set separately, in its own picker further down this page.',
  map: 'The map, embedded directly on the home screen.',
  // Not "Hebrew date, the daily zmanim grid, and upcoming Shabbos" any more
  // — that described the old ZmanimStrip this block used to render. It's
  // HomeBreak now: today's upcoming Davening Times, and the "Kept by the
  // Community" Add/Edit/Report card beside it.
  zmanim: 'Upcoming Davening Times, and the "Kept by the Community" card beside it.',
  shabbat: 'Shabbat/holiday candle-lighting times, and the email-subscribe card beside it. Renders only when a Zmanim category is configured.',
}

const TOPIC_KINDS = Object.keys(BUILT_IN_BLOCKS) as Exclude<HomeBlockKind, 'section'>[]

// Browse and Shabbat aren't single-heading blocks the way Featured/Map/Zmanim
// are — Browse's heading is the dedicated eyebrow/heading fields above, and
// Shabbat is two cards with no shared title at all — so their row skips the
// rename input entirely rather than offering a text field that (for Browse)
// would silently do nothing, or (for Shabbat) would have nowhere to render.
const UNRENAMEABLE_KINDS = new Set<Exclude<HomeBlockKind, 'section'>>(['browse', 'shabbat'])

export default function DesktopTopicsManager({
  sections,
  onChange,
  browseCopy,
}: {
  sections: DraftHomeSection[]
  onChange: (sections: DraftHomeSection[]) => void
  /** The Browse/search card's eyebrow + heading (settings.desktopBrowseEyebrow
   *  / desktopBrowseHeading) — shown inline on the Browse row itself, since
   *  that's the one topic whose "title" isn't a single renameable string.
   *  Optional so this component still renders standalone in tests that don't
   *  care about it. */
  browseCopy?: {
    eyebrow: string
    heading: string
    onEyebrowChange: (value: string) => void
    onHeadingChange: (value: string) => void
  }
}) {
  const topicEntries = sections.filter((s): s is DraftHomeSection & { kind: Exclude<HomeBlockKind, 'section'> } => s.kind !== 'section')
  // Left exactly as they are in every onChange call below — HomeSectionManager
  // owns reordering/renaming/removing these, not this component.
  const sectionEntries = sections.filter((s) => s.kind === 'section')
  const missingTopics = TOPIC_KINDS.filter((k) => !topicEntries.some((t) => t.kind === k))

  function addTopic(kind: Exclude<HomeBlockKind, 'section'>) {
    const b = BUILT_IN_BLOCKS[kind]
    onChange([...sectionEntries, ...topicEntries, { id: b.id, kind, title: b.title, cardIds: [] }])
  }

  function renameTopic(id: string, title: string) {
    onChange(sections.map((s) => (s.id === id ? { ...s, title } : s)))
  }

  function removeTopic(id: string, title: string) {
    if (!confirm(`Remove "${title}" from the home page? You can add it back anytime with the button below.`)) return
    onChange(sections.filter((s) => s.id !== id))
  }

  function moveTopic(index: number, dir: -1 | 1) {
    const other = index + dir
    if (other < 0 || other >= topicEntries.length) return
    const reordered = [...topicEntries]
    ;[reordered[index], reordered[other]] = [reordered[other], reordered[index]]
    onChange([...sectionEntries, ...reordered])
  }

  return (
    <div>
      <p className="text-sm text-muted mb-4">
        The desktop home screen&rsquo;s topics, in order — rename any of them, reorder, or remove one
        entirely. Mobile doesn&rsquo;t show these (it has its own tab bar instead). Part of this
        tab&rsquo;s Save changes below — nothing here goes live until you save.
      </p>

      {topicEntries.length > 0 && (
        <div className="space-y-3 max-w-2xl">
          {topicEntries.map((t, i) => (
            <div key={t.id} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3 mb-1">
                {UNRENAMEABLE_KINDS.has(t.kind) ? (
                  <p className="pt-2 text-sm font-medium text-slate-800">{BUILT_IN_BLOCKS[t.kind].title}</p>
                ) : (
                  <input
                    value={t.title}
                    onChange={(e) => renameTopic(t.id, e.target.value)}
                    placeholder={BUILT_IN_BLOCKS[t.kind].title}
                    className={`${inputClass} font-medium`}
                  />
                )}
                <div className="flex items-center gap-1 shrink-0 pt-1.5">
                  <button onClick={() => moveTopic(i, -1)} disabled={i === 0} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer px-1" aria-label="Move topic up">↑</button>
                  <button onClick={() => moveTopic(i, 1)} disabled={i === topicEntries.length - 1} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer px-1" aria-label="Move topic down">↓</button>
                  <button onClick={() => removeTopic(t.id, t.title)} className="text-xs text-red-600 hover:underline cursor-pointer ml-2">Remove</button>
                </div>
              </div>
              <p className="text-xs text-muted mb-2">{TOPIC_DESCRIPTIONS[t.kind]}</p>
              {t.kind === 'browse' && browseCopy && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  <label className="block">
                    <span className="block text-[11px] font-medium text-slate-600 mb-1">Eyebrow</span>
                    <input
                      value={browseCopy.eyebrow}
                      onChange={(e) => browseCopy.onEyebrowChange(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-medium text-slate-600 mb-1">Heading</span>
                    <input
                      value={browseCopy.heading}
                      onChange={(e) => browseCopy.onHeadingChange(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {missingTopics.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 max-w-2xl">
          {missingTopics.map((k) => (
            <button
              key={k}
              onClick={() => addTopic(k)}
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
