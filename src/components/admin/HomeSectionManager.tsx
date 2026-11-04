'use client'

import { useMemo, useState } from 'react'
import { newDraftSectionId, type DraftHomeSection } from '@/lib/homeSections'
import { useCategories } from '@/lib/useCategories'
import { useForms } from '@/lib/useForms'
import { community } from '@/community.config'
import DragList, { AddMenu, InnerRow, OrderRow, addButton, rowButton } from './DragList'

// ── The home-screen section grouping (title + which cards belong to each, in
// order), part of the Home page tab (see SiteSettingsEditor.tsx). Purely a
// controlled editor over a local draft — every action here just calls
// `onChange`; nothing reaches the server until the tab's shared "Save
// changes" button reconciles the draft (see homeSectionsDraft.ts).
//
// `sections` (the draft prop) actually holds every home_section row, plain
// sections AND the three built-in blocks (Popular right now / Explore the
// map / Zmanim & Shabbos / Browse / Shabbat — see homeSections.ts's
// HomeBlockKind) sharing one table/one save pipeline. Those built-ins are
// desktop-only concerns edited from their own place (DesktopTopicsManager,
// under the Desktop tab) — this component only ever renders/reorders the
// kind==='section' subset, carefully leaving any built-in entries in the
// draft untouched (see sectionEntries/builtInEntries below) rather than
// assuming the array is homogeneous. ──────────────────────────────────────

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
    const zmanim = categories.find((c) => c.kind === 'zmanim')
    const eruv = categories.find((c) => c.kind === 'eruv')
    const customForms = (forms ?? []).filter((f) => f.id !== 'support' && f.id !== 'volunteer')
    const supportForm = forms?.find((f) => f.id === 'support')
    const volunteerForm = forms?.find((f) => f.id === 'volunteer')

    // Note: the Map pseudo-category isn't listed here — "View Map" is now a
    // fixed button next to the search box (see HeroHeading), not a card that
    // can be placed in a section.
    return [
      ...(community.features.patientSupport && supportForm ? [{ id: 'support', label: 'Patient & Family Support' }] : []),
      ...(community.features.volunteer && volunteerForm ? [{ id: 'volunteer', label: 'Volunteer for Patients' }] : []),
      ...customForms.map((f) => ({ id: f.id, label: f.title })),
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
  // Each group one row with its cards named under it, opening to its name
  // and its cards (note 26); taking one off asks once.
  const [openId, setOpenId] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const cardOptions = useCardOptions()
  const labelById = useMemo(() => new Map(cardOptions.map((c) => [c.id, c.label])), [cardOptions])
  const cardName = (id: string) => labelById.get(id) ?? id

  const sectionEntries = sections.filter((s) => s.kind === 'section')
  // Left exactly as they are in every onChange call below — DesktopTopicsManager
  // owns reordering/renaming/removing these, not this component.
  const builtInEntries = sections.filter((s) => s.kind !== 'section')

  const assignedIds = useMemo(() => new Set(sectionEntries.flatMap((s) => s.cardIds)), [sectionEntries])
  const unassigned = cardOptions.filter((c) => !assignedIds.has(c.id))

  function addSection() {
    const id = newDraftSectionId()
    onChange([...sectionEntries, { id, kind: 'section', title: 'New group', cardIds: [], width: 'full' }, ...builtInEntries])
    setOpenId(id)
  }

  function renameSection(id: string, title: string) {
    onChange(sections.map((s) => (s.id === id ? { ...s, title } : s)))
  }

  // Its cards fall into the home page's trailing "More" until placed again.
  function deleteSection(id: string) {
    setRemoving(null)
    setOpenId(null)
    onChange(sections.filter((s) => s.id !== id))
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

  function setCards(sectionId: string, cardIds: string[]) {
    onChange(sections.map((s) => (s.id === sectionId ? { ...s, cardIds } : s)))
  }

  const quiet = 'min-h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer'

  return (
    <div>
      <DragList items={sectionEntries} keyOf={(s) => s.id} nameOf={(s) => s.title} onReorder={(next) => onChange([...next, ...builtInEntries])}>
        {(s, row) => {
          const open = openId === s.id
          // Every card not already in THIS group — not just the unassigned
          // pool: addCard pulls a card out of its old group, so this is also
          // how a card moves from one group to another.
          const availableHere = cardOptions
            .filter((c) => !s.cardIds.includes(c.id))
            .map((c) => ({ id: c.id, label: unassigned.includes(c) ? c.label : `${c.label} (move here)` }))
          return (
            <OrderRow
              row={row}
              name={s.title || 'Untitled group'}
              line={s.cardIds.length ? s.cardIds.map(cardName).join(' · ') : 'No cards yet'}
              open={open}
              onToggle={() => setOpenId(open ? null : s.id)}
            >
              <label className="block">
                <span className="block text-[13px] font-semibold text-slate-700 mb-1">Name</span>
                <input value={s.title} onChange={(e) => renameSection(s.id, e.target.value)} className={inputClass} />
              </label>
              {s.cardIds.length > 0 && (
                <DragList
                  items={s.cardIds}
                  keyOf={(id) => id}
                  nameOf={cardName}
                  onReorder={(next) => setCards(s.id, next)}
                  className="rounded-lg border border-slate-200"
                >
                  {(cardId, inner) => (
                    <InnerRow row={inner} name={cardName(cardId)} onRemove={() => setCards(s.id, s.cardIds.filter((id) => id !== cardId))} />
                  )}
                </DragList>
              )}
              {removing === s.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="m-0 flex-1 text-sm font-semibold text-slate-900">Take {s.title || 'this group'} off? Its cards move to More.</p>
                  <button type="button" onClick={() => deleteSection(s.id)} className="min-h-10 px-3 rounded-lg bg-red-600 text-white text-sm font-semibold cursor-pointer">
                    Take it off
                  </button>
                  <button type="button" onClick={() => setRemoving(null)} className={quiet}>
                    Leave it
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2.5">
                  <AddMenu label="+ Add a card" options={availableHere} onPick={(id) => addCard(s.id, id)} />
                  <button type="button" onClick={() => setRemoving(s.id)} className={rowButton}>
                    Take it off
                  </button>
                </div>
              )}
            </OrderRow>
          )
        }}
      </DragList>

      <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3">
        <div>
          <button type="button" onClick={addSection} className={addButton}>
            + Add a group
          </button>
        </div>
        {unassigned.length > 0 && <p className="m-0 text-[13px] text-slate-600">In More, at the end: {unassigned.map((c) => c.label).join(', ')}</p>}
      </div>
    </div>
  )
}
