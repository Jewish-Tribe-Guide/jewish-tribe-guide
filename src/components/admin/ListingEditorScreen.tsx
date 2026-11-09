'use client'

import { type ComponentProps, type ReactNode } from 'react'
import ListingEditor from '@/components/resources/ListingEditor'
import { useSetScreenHeader } from '@/lib/headerVisibility'
import { AdminBack } from './AdminUI'
import { useEditorSteps, useStepsInAddress } from './useStepsInAddress'

/**
 * The visitors' editor (ListingEditor) as a screen of its own, for the
 * admin console: the category editor's Preview, and Places' Add and edit. On the
 * site it sits in a sheet or a dialog whose header carries the title and
 * Back; here that header is the console's own, its chevron on a phone, and
 * Back closes an open row (or a minyan, a person in one) before it leaves.
 * `overlay`: a screen over it, the editor kept underneath with its draft and
 * its open row (a source's Change, in the Places listing); the host keeps
 * it in the address. `backLabel`: where Back goes, when it isn't a list
 * behind it.
 */
export default function ListingEditorScreen({
  heading,
  onClose,
  overlay,
  backLabel = 'Back',
  history = true,
  ...editor
}: {
  heading: string
  overlay?: { title: string; back: () => void; node: ReactNode } | null
  backLabel?: string
  /** Off for a preview beside the page, or one opened on a field: an open
   *  row isn't in the history, or Back first closed a row nobody opened
   *  (and, full size, the field the admin came to see). */
  history?: boolean
} & Omit<ComponentProps<typeof ListingEditor>, 'onStep' | 'reopen'>) {
  const { step, path, onStep, reopen, ask } = useEditorSteps()
  const title = overlay?.title ?? step?.title ?? heading
  const back = overlay?.back ?? (step ? step.back : onClose)
  // Each open row (and a minyan or a person in it) has an address and an
  // entry: Back, Forward and a reload land on it (stepAddress.ts).
  useStepsInAddress(history ? 'row' : null, path, ask)
  // The preview's own SiteHeader shows "‹ title" on mobile, as it does over
  // the real editor.
  useSetScreenHeader(true, title, back)
  return (
    <div className="flex flex-col gap-4">
      <AdminBack back={{ label: step || overlay ? 'Back' : backLabel, onClick: back }} title={title} />
      {overlay?.node}
      <div className={overlay ? 'hidden' : ''}>
        <ListingEditor {...editor} onClose={onClose} onStep={onStep} reopen={reopen} />
      </div>
    </div>
  )
}
