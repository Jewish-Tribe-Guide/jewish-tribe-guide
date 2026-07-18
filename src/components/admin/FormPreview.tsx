'use client'

import Wizard, { type Step } from '@/components/wizard/Wizard'
import type { FormContent, FormStep } from '@/lib/forms'

// Runs the exact Wizard component visitors see, against the admin's in-memory
// draft — so "what does this look like" can never drift from what actually
// ships. Nothing here reaches the network: Continue/Submit just resolve
// immediately into the (draft) success screen, and Close returns to the editor.

// optionsSource steps (currently only the volunteer form's "Where can you
// help?") normally resolve against the live hospital list; the preview has no
// such list to hand, so it substitutes a couple of placeholder options purely
// so the step renders something instead of an empty list.
function resolvePreviewSteps(steps: FormStep[]): Step[] {
  const resolved = steps.map((s) =>
    s.optionsSource === 'hospitals'
      ? {
          ...s,
          options: [
            { value: 'preview-a', label: 'Example Hospital A' },
            { value: 'preview-b', label: 'Example Hospital B' },
            { value: 'anywhere', label: 'Anywhere in the area' },
          ],
        }
      : s,
  )
  return resolved as unknown as Step[]
}

export default function FormPreview({ content, onClose }: { content: FormContent; onClose: () => void }) {
  return (
    <Wizard
      steps={resolvePreviewSteps(content.steps)}
      onSubmit={async () => {}}
      onClose={onClose}
      submitLabel={content.submitLabel}
      successTitle={content.successTitle}
      successMessage={content.successMessage}
    />
  )
}
