// Shared form primitives used across all intake sections
import React from 'react'

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary'

// ── Field wrapper ─────────────────────────────────────────────────────────────

type FieldProps = {
  label: string
  required?: boolean
  children: React.ReactNode
}

export function Field({ label, required, children }: FieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

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

// ── Textarea ──────────────────────────────────────────────────────────────────

export function Textarea({
  className,
  rows = 3,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={[`${inputClass} resize-none`, className].filter(Boolean).join(' ')}
      rows={rows}
      {...props}
    />
  )
}

// ── Select ────────────────────────────────────────────────────────────────────

type SelectInputProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string }[]
  placeholder?: string
}

export function SelectInput({ options, placeholder = 'Select…', className, ...props }: SelectInputProps) {
  return (
    <div className="relative">
      <select className={[`${inputClass} appearance-none pr-8`, className].filter(Boolean).join(' ')} {...props}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  )
}

// ── Checkbox group ────────────────────────────────────────────────────────────

type CheckboxGroupProps = {
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (selected: string[]) => void
  columns?: 1 | 2
}

export function CheckboxGroup({ options, selected, onChange, columns = 1 }: CheckboxGroupProps) {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else {
      onChange([...selected, value])
    }
  }
  return (
    <div className={columns === 2 ? 'grid grid-cols-2 gap-x-4 gap-y-2' : 'space-y-2'}>
      {options.map((o) => (
        <label
          key={o.value}
          className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={selected.includes(o.value)}
            onChange={() => toggle(o.value)}
            className="rounded border-slate-300 text-primary focus:ring-primary"
          />
          {o.label}
        </label>
      ))}
    </div>
  )
}

// ── Radio group ───────────────────────────────────────────────────────────────

type RadioGroupProps = {
  name: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  columns?: 1 | 2
}

export function RadioGroup({ name, options, value, onChange, columns = 1 }: RadioGroupProps) {
  return (
    <div className={columns === 2 ? 'grid grid-cols-2 gap-x-4 gap-y-2' : 'space-y-2'}>
      {options.map((o) => (
        <label
          key={o.value}
          className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer"
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="border-slate-300 text-primary focus:ring-primary"
          />
          {o.label}
        </label>
      ))}
    </div>
  )
}

// ── Section divider (base sections) ──────────────────────────────────────────

export function SectionDivider({ title, icon, required }: { title: string; icon: string; required?: boolean }) {
  return (
    // When this is the first element in a form/card, drop the top rule + spacing
    // so there's no divider line floating at the very top.
    <div className="flex items-center gap-2 pt-6 pb-3 border-t border-slate-200 mt-2 first:border-t-0 first:pt-0 first:mt-0">
      <span aria-hidden="true">{icon}</span>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </h3>
    </div>
  )
}

// ── Service section wrapper (revealed sections in the big form) ───────────────

export function ServiceSection({
  title,
  icon,
  children,
}: {
  title: string
  icon: string
  children: React.ReactNode
}) {
  return (
    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-4">
      <h4 className="text-sm font-semibold text-primary flex items-center gap-2">
        <span aria-hidden="true">{icon}</span>
        {title}
      </h4>
      {children}
    </div>
  )
}

// ── Submit button + 24h note (used by every mini form) ────────────────────────

type SubmitButtonProps = {
  submitting: boolean
  label?: string
}

export function SubmitButton({ submitting, label = 'Submit Request' }: SubmitButtonProps) {
  return (
    <div className="pt-2">
      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-primary hover:bg-primary-dark text-white font-semibold px-6 py-3 rounded-md shadow transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting ? 'Submitting…' : label}
      </button>
      <p className="text-xs text-muted text-center mt-3">
        A community representative will review your request and reach out within 24 hours.
      </p>
    </div>
  )
}
