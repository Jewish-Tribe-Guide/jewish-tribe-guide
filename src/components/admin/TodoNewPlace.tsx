'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { DirectoryResource, EnrichedSubmission, ResourceSubmission } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import ListingEditor, { type EditorControl, type EditorStep } from '@/components/resources/ListingEditor'
import { useListingDraft } from '@/components/resources/useListingDraft'
import PlaceFrame, { PlaceButtons, placeSubline, type PlaceButton, type PlacePosition } from './PlaceFrame'
import { SubmissionSourceCard } from './TodoChange'
import { useHistoryDepth } from '@/lib/useHistoryDepth'

// A new place on To do (board L3NewPlace): the listing as it would go in,
// in the site's own editor, a row for each thing it has and "Not on the
// listing yet" for the rest; where it came from, folded under; "Add to the
// guide", once nothing it needs is missing, or "Leave it".

/** A sent place as the editor reads a listing. */
export function asListing(sent: ResourceSubmission): DirectoryResource {
  return {
    ...sent.details,
    id: '',
    category: sent.category,
    name: sent.name ?? '',
    anchorId: sent.anchorId ?? 'all',
    distance: 0,
    address: sent.address ?? '',
    phone: sent.phone ?? undefined,
    ...(sent.geo ? { geo: sent.geo } : {}),
  }
}

/** What goes in, an edit in the card included: the place as it was sent,
 *  what the editor holds over it, and Google's record of what it filled in
 *  kept unless a new pick made one. */
export function withEdits(sent: ResourceSubmission, built: ResourceSubmission): ResourceSubmission {
  const filled = built.details.googleAutofill
  const refilled = !!filled && typeof filled === 'object' && Object.keys(filled).length > 0
  return {
    ...sent,
    name: built.name,
    address: built.address,
    phone: built.phone,
    geo: built.geo ?? sent.geo,
    details: { ...sent.details, ...built.details, ...(refilled ? {} : 'googleAutofill' in sent.details ? { googleAutofill: sent.details.googleAutofill } : {}) },
  }
}

export default function TodoNewPlace({
  submission: s,
  category,
  name,
  position,
  switches,
  busy,
  error,
  token,
  onModerate,
  onUpdated,
  onEditing,
}: {
  submission: EnrichedSubmission
  category: CategoryConfig
  name: string
  position: PlacePosition
  switches: ReactNode
  busy?: boolean
  error?: string | null
  token: string
  onModerate: (id: string, status: 'rejected') => void
  onUpdated: (id: string) => void
  onEditing: (editing: boolean) => void
}) {
  const community = useCommunitySlug()
  const sent = s.payload as unknown as ResourceSubmission
  const [start] = useState(() => asListing(sent))
  const draft = useListingDraft(category, start)

  const control = useRef<EditorControl | null>(null)
  const [edit, setEdit] = useState({ ready: false, edited: false, sending: false })
  const edited = useRef(false)
  const onControl = useCallback((c: EditorControl) => {
    control.current = c
    edited.current = c.edited
    setEdit((e) => (e.ready === c.changed && e.edited === c.edited && e.sending === c.sending ? e : { ready: c.changed, edited: c.edited, sending: c.sending }))
  }, [])
  useEffect(() => {
    onEditing(edit.edited)
    return () => onEditing(false)
  }, [edit.edited, onEditing])
  const [step, setStep] = useState<EditorStep | null>(null)
  // An open row or a minyan in it is an entry, as in Places' editor: a
  // swipe back closes it rather than leaving the place (Nov 4).
  useHistoryDepth('todoStep', step ? (step.depth ?? 1) : 0, () => step?.back())
  const inStep = !!step?.title

  const sending = busy || edit.sending
  const buttons: PlaceButton[] = [
    { label: 'Add to the guide', busy: edit.sending && 'Adding…', disabled: sending || !edit.ready, onClick: () => void control.current?.send() },
    { label: 'Leave it', busy: busy && !edit.sending && 'Saving…', disabled: sending, onClick: () => onModerate(s.id, 'rejected') },
  ]

  return (
    <PlaceFrame
      name={name}
      subline={placeSubline(`New place · ${s.categoryLabel ?? category.label}`, null)}
      position={position}
      onBack={inStep ? step!.back : undefined}
      switches={inStep ? null : switches}
      source={!inStep && <SubmissionSourceCard submission={s} details={sent.details} />}
      error={error}
      foot={!inStep && <PlaceButtons buttons={buttons} />}
    >
      <ListingEditor
        key={s.id}
        category={category}
        draft={draft}
        onClose={() => {}}
        onStep={setStep}
        hosted={{ onControl }}
        splitContact
        adminSave={{
          label: 'Add to the guide',
          // As it was sent unless something was changed in it.
          via: ({ payload }) =>
            fetch(withCommunity(`/api/admin/submissions/${s.id}`, community), {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ status: 'approved', ...(edited.current ? { payload: withEdits(sent, payload) } : {}) }),
            }),
          onSaved: () => onUpdated(s.id),
        }}
      />
    </PlaceFrame>
  )
}
