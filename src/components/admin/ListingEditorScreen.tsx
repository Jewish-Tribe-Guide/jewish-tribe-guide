'use client'

import { useState, type ComponentProps, type ReactNode } from 'react'
import ListingEditor, { type EditorStep } from '@/components/resources/ListingEditor'
import { useSetScreenHeader } from '@/lib/headerVisibility'
import { AdminBack } from './AdminUI'

/**
 * The visitors' editor (ListingEditor) as a screen of its own, for the
 * admin console: the category editor's Preview, and "+ Add listing". On the
 * site it sits in a sheet or a dialog whose header carries the title and
 * Back; here that header is the console's own, its chevron on a phone, and
 * Back closes an open row (or a minyan, a person in one) before it leaves.
 * `overlay`: a screen over it, the editor kept underneath with its draft and
 * its open row (a source's Change, in the Places listing). `backLabel`: where
 * Back goes, when it isn't a list behind it.
 */
export default function ListingEditorScreen({
  heading,
  onClose,
  overlay,
  backLabel = 'Back',
  ...editor
}: { heading: string; overlay?: { title: string; back: () => void; node: ReactNode } | null; backLabel?: string } & Omit<ComponentProps<typeof ListingEditor>, 'onStep'>) {
  const [step, setStep] = useState<EditorStep | null>(null)
  const title = overlay?.title ?? step?.title ?? heading
  const back = overlay?.back ?? (step ? step.back : onClose)
  // The preview's own SiteHeader shows "‹ title" on mobile, as it does over
  // the real editor.
  useSetScreenHeader(true, title, back)
  return (
    <div className="flex flex-col gap-4">
      <AdminBack back={{ label: step || overlay ? 'Back' : backLabel, onClick: back }} title={title} />
      {overlay?.node}
      <div className={overlay ? 'hidden' : ''}>
        <ListingEditor {...editor} onClose={onClose} onStep={setStep} />
      </div>
    </div>
  )
}
