import type { Decide } from './waitingGroups'

// A waiting group's answers (waitingGroups' Decide), the first its main
// one: what each sends. Shared by the place's own screen (OpenedPlace) and
// To do's (TodoWaiting), so the two decide the same way.

export type WaitAnswer = { label: string; work: () => Promise<unknown> }

type Send = {
  /** PATCH /api/admin/submissions/:id. */
  patch: (id: string, body: Record<string, unknown>) => Promise<unknown>
  post: (path: string, body: Record<string, unknown>) => Promise<unknown>
}

export function waitingAnswers(d: Decide, placeId: string, { patch, post }: Send): WaitAnswer[] {
  const each = (ids: readonly string[], body: (id: string) => Record<string, unknown>) => async () => {
    for (const id of ids) await patch(id, body(id))
  }
  const google = (body: Record<string, unknown>) => () => post('/api/admin/watches/google', { ...body, id: placeId })
  const menu = (action: 'use' | 'skip') => () => post('/api/admin/main-dishes', { action, resourceId: placeId })
  // Bring it back: the guide's archived listing restored, with the list's
  // hechsher once its new place is filed.
  const restore = (archivedId: string, id?: string) => () => post('/api/admin/watches/kosher', { action: 'restore', resourceId: archivedId, ...(id ? { id } : {}) })
  if (d.kind === 'later') return d.archivedId ? [{ label: 'Bring it back', work: restore(d.archivedId) }] : []
  if (d.kind === 'closure') return [{ label: 'Keep closed', work: google({ action: 'open', open: false }) }, { label: 'Show as open', work: google({ action: 'open', open: true }) }]
  if (d.kind === 'new')
    return [
      ...(d.archivedId ? [{ label: 'Bring it back', work: restore(d.archivedId, d.id) }] : []),
      { label: 'Add as new', work: each([d.id], () => ({ status: 'approved' })) },
      { label: 'Don’t add', work: each([d.id], () => ({ status: 'rejected' })) },
    ]
  if (d.kind === 'off' || d.kind === 'archive')
    return [
      { label: 'Remove the listing', work: d.kind === 'off' ? each([d.id], () => ({ status: 'approved' })) : () => post('/api/admin/watches/kosher', { action: 'archive', id: d.id }) },
      { label: 'Keep it', work: each([d.id], () => ({ status: 'rejected' })) },
      ...(d.kind === 'off' && d.renamed ? [{ label: `It’s ${d.renamed} now`, work: () => post('/api/admin/watches/kosher', { action: 'renamed', id: d.id }) }] : []),
    ]
  // Wrong place: Google matched another place. The match goes, and the
  // place opens again on Find it on Google or Not on Google.
  if (d.kind === 'google')
    return [
      { label: 'Accept', work: google({ action: 'use' }) },
      { label: 'Keep as is', work: google({ action: 'keep' }) },
      { label: 'Wrong place', work: google({ action: 'wrong_place' }) },
    ]
  // Look again's find: what it found used, or never offered again.
  if (d.kind === 'found') {
    const look = (action: 'use' | 'not') => () => post('/api/admin/watches/look-again', { action, kind: d.look, id: placeId })
    return d.look === 'eruv'
      ? [{ label: 'Use this page', work: look('use') }, { label: 'Not this page', work: look('not') }]
      : [{ label: 'Use this place', work: look('use') }, { label: 'Not this place', work: look('not') }]
  }
  if (d.kind === 'menu') return [{ label: 'Accept', work: menu('use') }, { label: 'Keep as is', work: menu('skip') }]
  return [
    { label: 'Accept', work: each(d.ids, (id) => ({ status: 'approved', ...(d.only?.[id] ? { only: d.only[id] } : {}) })) },
    { label: 'Keep as is', work: each(d.ids, () => ({ status: 'rejected' })) },
  ]
}
