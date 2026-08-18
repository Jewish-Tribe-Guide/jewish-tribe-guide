'use client'

import { BUILT_IN_BLOCKS, type DraftHomeSection, type HomeBlockKind } from '@/lib/homeSections'

// ── The desktop home screen's three singleton "topic" blocks — Popular right
// now (the featured-cards row), Explore the map, and Zmanim & Shabbos —
// reorderable, renameable, and removable, same shared draft/Save pipeline as
// HomeSectionManager's category sections (see homeSectionsDraft.ts). Lives
// under the Desktop & mobile tab's Desktop toggle, not the Site tab's plain
// "Home page sections": mobile never shows any of these three (see
// Landing.tsx — all three are desktop-only), so they belong with the other
// desktop-only settings (Featured cards' own 3-slot picker), not mixed in
// with the cross-device category-section list.
//
// `sections` (the draft prop) actually holds every home_section row —
// carefully only ever reads/reorders the kind!=='section' subset here,
// leaving any plain category sections in the draft untouched (see
// topicEntries/sectionEntries below) — HomeSectionManager owns those. ──────

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

const TOPIC_DESCRIPTIONS: Record<Exclude<HomeBlockKind, 'section'>, string> = {
  featured: 'The three-card row between the search box and the map. Which cards fill it is set separately, in its own picker further down this page.',
  map: 'The map, embedded directly on the home screen.',
  zmanim: 'Hebrew date, the daily zmanim grid, and upcoming Shabbos.',
}

const TOPIC_KINDS = Object.keys(BUILT_IN_BLOCKS) as Exclude<HomeBlockKind, 'section'>[]

export default function DesktopTopicsManager({
  sections,
  onChange,
}: {
  sections: DraftHomeSection[]
  onChange: (sections: DraftHomeSection[]) => void
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
                <input
                  value={t.title}
                  onChange={(e) => renameTopic(t.id, e.target.value)}
                  placeholder={BUILT_IN_BLOCKS[t.kind].title}
                  className={`${inputClass} font-medium`}
                />
                <div className="flex items-center gap-1 shrink-0 pt-1.5">
                  <button onClick={() => moveTopic(i, -1)} disabled={i === 0} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer px-1" aria-label="Move topic up">↑</button>
                  <button onClick={() => moveTopic(i, 1)} disabled={i === topicEntries.length - 1} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer px-1" aria-label="Move topic down">↓</button>
                  <button onClick={() => removeTopic(t.id, t.title)} className="text-xs text-red-600 hover:underline cursor-pointer ml-2">Remove</button>
                </div>
              </div>
              <p className="text-xs text-muted">{TOPIC_DESCRIPTIONS[t.kind]}</p>
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
