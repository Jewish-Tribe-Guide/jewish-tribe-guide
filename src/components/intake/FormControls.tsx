// Shared form primitives — this file used to hold a full set (Field, Textarea,
// SelectInput, CheckboxGroup, RadioGroup, SectionDivider, ServiceSection,
// SubmitButton) for the old fixed-shape intake wizard (see types.ts's own
// note on IntakeFormData and friends, removed the same way). TextInput is the
// one still standing: the one real primitive AddressInput still imports.
import React from 'react'

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary'

// ── Text input ────────────────────────────────────────────────────────────────

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, type, autoComplete, ...props }, ref) {
    // Date fields should never be browser-autofilled (avoids surprise "prefilled" dates).
    const resolvedAutoComplete = autoComplete ?? (type === 'date' ? 'off' : undefined)
    // A native date input renders its "mm/dd/yyyy" format text in the full text
    // color; gray it like a placeholder until a real date is entered (styled in
    // globals.css).
    const isEmptyDate = type === 'date' && !props.value
    return (
      <input
        ref={ref}
        type={type}
        autoComplete={resolvedAutoComplete}
        className={[inputClass, isEmptyDate && 'date-empty', className].filter(Boolean).join(' ')}
        {...props}
      />
    )
  }
)
