'use client'

import { useMemo, useState } from 'react'
import { newDraftSectionId, type DraftHomeSection } from '@/lib/homeSections'
import { useCategories } from '@/lib/useCategories'
import { useForms } from '@/lib/useForms'
import { community } from '@/community.config'

// ── The home-screen section grouping (title + which cards belong to each, in
// order), part of the Home page tab (see SiteSettingsEditor.tsx). Purely a
// controlled editor over a local draft — every action here just calls
// `onChange`; nothing reaches the server until the tab's shared "Save
// changes" button reconciles the draft (see homeSectionsDraft.ts). ──────────

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

export type CardOption = { id: string; label: string }

/** Every card that could be placed in a section — mirrors the entry + resource
 *  cards Landing.tsx builds, reduced to just id/label for the picker. Kept in
 *  sync with Landing.tsx's own card list; if a new fixed card type is added
 *  there, add it here too so it can be assigned to a section.
 *
 *  Also drives the featured-trio picker in SiteSettingsEditor, which chooses
 *  from this same set — so both pickers offer exactly what the home screen
 *  can actually render. */
export function useCardOptions(): CardOption[] {
  const categories = useCategories()
  const forms = useForms()

  return useMemo(() => {
    if (!categories) return []
    const medical = categories.find((c) => c.kind === 'medical')
    const zmanim = categories.find((c) => c.kind === 'zmanim')
    const eruv = categories.find((c) => c.kind === 'eruv')
    const customForms = (forms ?? []).filter((f) => f.id !== 'support' && f.id !== 'volunteer')

    // Note: the Map pseudo-category isn't listed here — "View Map" is now a
    // fixed button next to the search box (see HeroHeading), not a card that
    // can be placed in a section.
    return [
      ...(community.features.patientSupport ? [{ id: 'support', label: 'Patient & Family Support' }] : []),
      ...(community.features.volunteer ? [{ id: 'volunteer', label: 'Volunteer for Patients' }] : []),
      ...customForms.map((f) => ({ id: f.id, label: f.title })),
      ...(medical ? [{ id: 'medical', label: medical.pluralLabel }] : []),
      ...categories.filter((c) => c.kind === 'listing').map((c) => ({ id: c.id, label: c.pluralLabel })),
      ...(zmanim ? [{ id: 'zmanim', label: zmanim.pluralLabel }] : []),
      ...(eruv ? [{ id: 'eruv', label: eruv.pluralLabel }] : []),
    ]
  }, [categories, forms])
}

export default function HomeSectionManager({
  sections,
  onChange,
}: {
  sections: DraftHomeSection[]
  onChange: (sections: DraftHomeSection[]) => void
}) {
  const [newTitle, setNewTitle] = useState('')
  const cardOptions = useCardOptions()
  const labelById = useMemo(() => new Map(cardOptions.map((c) => [c.id, c.label])), [cardOptions])

  const assignedIds = useMemo(() => new Set(sections.flatMap((s) => s.cardIds)), [sections])
  const unassigned = cardOptions.filter((c) => !assignedIds.has(c.id))

  function addSection() {
    if (!newTitle.trim()) return
    onChange([...sections, { id: newDraftSectionId(), title: newTitle.trim(), cardIds: [] }])
    setNewTitle('')
  }

  function renameSection(id: string, title: string) {
    onChange(sections.map((s) => (s.id === id ? { ...s, title } : s)))
  }

  function deleteSection(id: string, title: string) {
    if (!confirm(`Remove "${title}"? Its cards will fall into the home page's trailing "More" section until reassigned.`)) return
    onChange(sections.filter((s) => s.id !== id))
  }

  function moveSection(index: number, dir: -1 | 1) {
    const other = index + dir
    if (other < 0 || other >= sections.length) return
    const next = [...sections]
    ;[next[index], next[other]] = [next[other], next[index]]
    onChange(next)
  }

  // Adds a card to `sectionId`, first pulling it out of whatever section it's
  // currently in (a card only ever lives in one section).
  function addCard(sectionId: string, cardId: string) {
    onChange(
      sections.map((s) => {
        if (s.id === sectionId) return { ...s, cardIds: [...s.cardIds, cardId] }
        if (s.cardIds.includes(cardId)) return { ...s, cardIds: s.cardIds.filter((id) => id !== cardId) }
        return s
      }),
    )
  }

  function removeCard(sectionId: string, cardId: string) {
    onChange(sections.map((s) => (s.id === sectionId ? { ...s, cardIds: s.cardIds.filter((id) => id !== cardId) } : s)))
  }

  function moveCard(sectionId: string, index: number, dir: -1 | 1) {
    const section = sections.find((s) => s.id === sectionId)
    if (!section) return
    const other = index + dir
    if (other < 0 || other >= section.cardIds.length) return
    const cardIds = [...section.cardIds]
    ;[cardIds[index], cardIds[other]] = [cardIds[other], cardIds[index]]
    onChange(sections.map((s) => (s.id === sectionId ? { ...s, cardIds } : s)))
  }

  return (
    <div>
      <p className="text-sm text-muted mb-4">
        Groups of cards shown on the home screen, in order. A card not placed in any section falls into a
        trailing &ldquo;More&rdquo; section instead of disappearing. Part of this tab&rsquo;s Save changes
        below — nothing here goes live until you save.
      </p>

      <div className="space-y-4 max-w-2xl">
        {sections.map((s, i) => (
          <div key={s.id} className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <input
                value={s.title}
                onChange={(e) => renameSection(s.id, e.target.value)}
                className={`${inputClass} font-medium`}
              />
              <div className="flex items-center gap-1 shrink-0 pt-1.5">
                <button onClick={() => moveSection(i, -1)} disabled={i === 0} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer px-1" aria-label="Move section up">↑</button>
                <button onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer px-1" aria-label="Move section down">↓</button>
                <button onClick={() => deleteSection(s.id, s.title)} className="text-xs text-red-600 hover:underline cursor-pointer ml-2">Delete</button>
              </div>
            </div>

            {s.cardIds.length === 0 ? (
              <p className="text-xs text-muted italic mb-2">No cards yet.</p>
            ) : (
              <ul className="space-y-1 mb-3">
                {s.cardIds.map((cardId, ci) => (
                  <li key={cardId} className="flex items-center justify-between gap-2 bg-slate-50 rounded px-2 py-1">
                    <span className="text-sm text-slate-800">{labelById.get(cardId) ?? cardId}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => moveCard(s.id, ci, -1)} disabled={ci === 0} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer px-1" aria-label="Move card up">↑</button>
                      <button onClick={() => moveCard(s.id, ci, 1)} disabled={ci === s.cardIds.length - 1} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer px-1" aria-label="Move card down">↓</button>
                      <button onClick={() => removeCard(s.id, cardId)} className="text-xs text-red-600 hover:underline cursor-pointer ml-1">Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Every card not already in THIS section — not just the
                unassigned pool. addCard already pulls a card out of whatever
                section it's currently in, so this is also how a card moves
                from one section to another; scoping the list to `unassigned`
                only meant that once every card had a home, the "+ Add a
                card" control vanished from every section with no way left to
                reorganize them short of removing one first. */}
            {(() => {
              const availableHere = cardOptions.filter((c) => !s.cardIds.includes(c.id))
              return availableHere.length > 0 && (
                <select
                  value=""
                  onChange={(e) => e.target.value && addCard(s.id, e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">+ Add a card…</option>
                  {availableHere.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                      {!unassigned.includes(c) ? ' (move here)' : ''}
                    </option>
                  ))}
                </select>
              )
            })()}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-4 max-w-2xl">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New section title"
          className={inputClass}
        />
        <button
          onClick={addSection}
          disabled={!newTitle.trim()}
          className="shrink-0 text-sm font-medium bg-primary text-white rounded-md px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-60 cursor-pointer"
        >
          Add section
        </button>
      </div>

      {unassigned.length > 0 && (
        <div className="mt-6 max-w-2xl">
          <p className="text-xs font-medium text-slate-700 mb-1.5">
            Not in any section — shown in a trailing &ldquo;More&rdquo; section on the home page:
          </p>
          <p className="text-xs text-muted">{unassigned.map((c) => c.label).join(', ')}</p>
        </div>
      )}
    </div>
  )
}
