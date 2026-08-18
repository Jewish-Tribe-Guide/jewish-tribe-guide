import type { HomeBlockKind, HomeSection, DraftHomeSection } from './homeSections'

async function patchSection(
  token: string,
  id: string,
  patch: Partial<Pick<HomeSection, 'title' | 'cardIds' | 'sortOrder'>>,
): Promise<HomeSection> {
  const res = await fetch(`/api/admin/home-sections/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  })
  const body = await res.json()
  if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Could not save a section.')
  return body.section as HomeSection
}

async function createSection(
  token: string,
  title: string,
  cardIds: string[],
  kind: HomeBlockKind,
): Promise<HomeSection> {
  // A built-in block's own title/cardIds are fixed server-side (see
  // createHomeSection) — sent along anyway is harmless, just ignored.
  const res = await fetch('/api/admin/home-sections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(kind === 'section' ? { title, cardIds } : { kind }),
  })
  const body = await res.json()
  if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Could not create a section.')
  return body.section as HomeSection
}

async function deleteSection(token: string, id: string): Promise<void> {
  const res = await fetch(`/api/admin/home-sections/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await res.json()
  if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || 'Could not delete a section.')
}

/** True if the two sections' saved fields (title/cardIds) differ — ignores
 *  sortOrder, which is reconciled separately (see below). */
function changed(original: HomeSection, draft: DraftHomeSection): boolean {
  return original.title !== draft.title || JSON.stringify(original.cardIds) !== JSON.stringify(draft.cardIds)
}

/** Reconciles the Home page tab's local, unsaved section draft against the
 *  server — called once, from the shared "Save changes" button, instead of
 *  each add/rename/reorder/delete hitting the API immediately. Deletes
 *  sections dropped from the draft, creates new ones (swapping in their real
 *  id), updates changed titles/card lists, then syncs sortOrder to match the
 *  draft's final on-screen order. Sequential, not parallel — this only ever
 *  runs on an explicit Save with a handful of sections, and staying
 *  sequential keeps the create → real-id → reorder dependency simple.
 *  Returns the saved sections, ready to become the new original + draft. */
export async function saveHomeSections(
  token: string,
  original: HomeSection[],
  draft: DraftHomeSection[],
): Promise<HomeSection[]> {
  const originalById = new Map(original.map((s) => [s.id, s]))

  const removed = original.filter((o) => !draft.some((d) => d.id === o.id))
  for (const s of removed) {
    await deleteSection(token, s.id)
  }

  const savedInOrder: HomeSection[] = []
  for (const d of draft) {
    const existing = originalById.get(d.id)
    if (!existing) {
      savedInOrder.push(await createSection(token, d.title, d.cardIds, d.kind))
    } else if (changed(existing, d)) {
      savedInOrder.push(await patchSection(token, d.id, { title: d.title, cardIds: d.cardIds }))
    } else {
      savedInOrder.push(existing)
    }
  }

  const final: HomeSection[] = []
  for (const [i, s] of savedInOrder.entries()) {
    const sortOrder = (i + 1) * 100
    final.push(s.sortOrder === sortOrder ? s : await patchSection(token, s.id, { sortOrder }))
  }

  return final
}
