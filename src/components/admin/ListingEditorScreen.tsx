'use client'

import { useState, type ComponentProps } from 'react'
import ListingEditor, { type EditorStep } from '@/components/resources/ListingEditor'
import UpButton from '@/components/UpButton'
import { useSetScreenHeader } from '@/lib/headerVisibility'

/**
 * The visitors' editor (ListingEditor) as a screen of its own, for the
 * admin console: the category editor's Preview, and "+ Add listing". On the
 * site it sits in a sheet or a dialog whose header carries the title and
 * Back; here that header is a Back above a heading, and Back closes an open
 * row (or a minyan, a person in one) before it leaves.
 */
export default function ListingEditorScreen({
  heading,
  onClose,
  ...editor
}: { heading: string } & Omit<ComponentProps<typeof ListingEditor>, 'onStep'>) {
  const [step, setStep] = useState<EditorStep | null>(null)
  const title = step?.title ?? heading
  const back = step ? step.back : onClose
  // The preview's own SiteHeader shows "‹ title" on mobile, as it does over
  // the real editor.
  useSetScreenHeader(true, title, back)
  return (
    <div>
      <UpButton label="Back" onClick={back} className="mb-2" />
      <h2 className="mb-3 truncate text-xl font-semibold text-slate-800">{title}</h2>
      <ListingEditor {...editor} onClose={onClose} onStep={setStep} />
    </div>
  )
}
