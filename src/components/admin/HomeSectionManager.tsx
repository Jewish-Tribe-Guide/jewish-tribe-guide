'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { HomeSection } from '@/lib/homeSections'
import { useCategories } from '@/lib/useCategories'
import { useForms } from '@/lib/useForms'
import { community } from '@/community.config'

// ── The Sections tab: the home-screen grouping (title + which cards belong to
// each, in order). Every action saves immediately (no draft/publish step) —
// same as the rest of /admin. Mounted on /admin. ───────────────────────────────

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

type CardOption = { id: string; label: string }

/** Every card that could be placed in a section — mirrors the entry + resource
 *  cards Landing.tsx builds, reduced to just id/label for the picker. Kept in
 *  sync with Landing.tsx's own card list; if a new fixed card type is added
 *  there, add it here too so it can be assigned to a section. */
function useCardOptions(): CardOption[] {
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

export default function HomeSectionManager({ token }: { token: string }) {
  const [sections, setSections] = useState<HomeSection[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const cardOptions = useCardOptions()
  const labelById = useMemo(() => new Map(cardOptions.map((c) => [c.id, c.label])), [cardOptions])

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/admin/home-sections', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Failed to load.')
      setSections(body.sections as HomeSection[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const assignedIds = useMemo(
    () => new Set((sections ?? []).flatMap((s) => s.cardIds)),
    [sections],
  )
  const unassigned = cardOptions.filter((c) => !assignedIds.has(c.id))

  async function patchSection(id: string, patch: { title?: string; cardIds?: string[]; sortOrder?: number }) {
    const res = await fetch(`/api/admin/home-sections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    })
    const body = await res.json()
    if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Save failed.')
    return body.section as HomeSection
  }

  async function addSection() {
    if (!newTitle.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/home-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: newTitle }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Could not create section.')
      setSections((prev) => [...(prev ?? []), body.section as HomeSection])
      setNewTitle('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function renameSection(id: string, title: string) {
    setSections((prev) => prev?.map((s) => (s.id === id ? { ...s, title } : s)) ?? prev)
    try {
      await patchSection(id, { title })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
      load()
    }
  }

  async function deleteSection(id: string, title: string) {
    if (!confirm(`Delete "${title}"? Its cards will fall into the home page's trailing "More" section until reassigned.`)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/home-sections/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Could not delete section.')
      setSections((prev) => prev?.filter((s) => s.id !== id) ?? prev)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function moveSection(index: number, dir: -1 | 1) {
    if (!sections) return
    const other = index + dir
    if (other < 0 || other >= sections.length) return
    const a = sections[index]
    const b = sections[other]
    const next = [...sections]
    next[index] = b
    next[other] = a
    setSections(next)
    setError(null)
    try {
      await Promise.all([
        patchSection(a.id, { sortOrder: b.sortOrder }),
        patchSection(b.id, { sortOrder: a.sortOrder }),
      ])
      setSections((prev) =>
        prev?.map((s) => (s.id === a.id ? { ...s, sortOrder: b.sortOrder } : s.id === b.id ? { ...s, sortOrder: a.sortOrder } : s)) ?? prev,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
      load()
    }
  }

  // Adds a card to `sectionId`, first pulling it out of whatever section it's
  // currently in (a card only ever lives in one section).
  async function addCard(sectionId: string, cardId: string) {
    if (!sections) return
    const from = sections.find((s) => s.cardIds.includes(cardId))
    const next = sections.map((s) => {
      if (s.id === sectionId) return { ...s, cardIds: [...s.cardIds, cardId] }
      if (from && s.id === from.id) return { ...s, cardIds: s.cardIds.filter((id) => id !== cardId) }
      return s
    })
    setSections(next)
    setError(null)
    try {
      if (from && from.id !== sectionId) {
        await patchSection(from.id, { cardIds: from.cardIds.filter((id) => id !== cardId) })
      }
      const target = next.find((s) => s.id === sectionId)!
      await patchSection(sectionId, { cardIds: target.cardIds })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
      load()
    }
  }

  async function removeCard(sectionId: string, cardId: string) {
    if (!sections) return
    const next = sections.map((s) =>
      s.id === sectionId ? { ...s, cardIds: s.cardIds.filter((id) => id !== cardId) } : s,
    )
    setSections(next)
    setError(null)
    try {
      const target = next.find((s) => s.id === sectionId)!
      await patchSection(sectionId, { cardIds: target.cardIds })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
      load()
    }
  }

  async function moveCard(sectionId: string, index: number, dir: -1 | 1) {
    if (!sections) return
    const section = sections.find((s) => s.id === sectionId)
    if (!section) return
    const other = index + dir
    if (other < 0 || other >= section.cardIds.length) return
    const cardIds = [...section.cardIds]
    ;[cardIds[index], cardIds[other]] = [cardIds[other], cardIds[index]]
    const next = sections.map((s) => (s.id === sectionId ? { ...s, cardIds } : s))
    setSections(next)
    setError(null)
    try {
      await patchSection(sectionId, { cardIds })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
      load()
    }
  }

  if (error && !sections) {
    return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  }
  if (!sections) {
    return <p className="text-sm text-muted">Loading…</p>
  }

  return (
    <div>
      <p className="text-sm text-muted mb-4">
        Groups of cards shown on the home screen, in order. A card not placed in any section falls into a
        trailing &ldquo;More&rdquo; section instead of disappearing. Changes go live immediately.
      </p>

      {error && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{error}</p>
      )}

      <div className="space-y-4 max-w-2xl">
        {sections.map((s, i) => (
          <div key={s.id} className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <input
                value={s.title}
                onChange={(e) => setSections((prev) => prev?.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)) ?? prev)}
                onBlur={(e) => renameSection(s.id, e.target.value)}
                className={`${inputClass} font-medium`}
              />
              <div className="flex items-center gap-1 shrink-0 pt-1.5">
                <button onClick={() => moveSection(i, -1)} disabled={i === 0} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer px-1" aria-label="Move section up">↑</button>
                <button onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer px-1" aria-label="Move section down">↓</button>
                <button onClick={() => deleteSection(s.id, s.title)} disabled={busy} className="text-xs text-red-600 hover:underline cursor-pointer ml-2">Delete</button>
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

            {unassigned.length > 0 && (
              <select
                value=""
                onChange={(e) => e.target.value && addCard(s.id, e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">+ Add a card…</option>
                {unassigned.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            )}
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
          disabled={busy || !newTitle.trim()}
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
