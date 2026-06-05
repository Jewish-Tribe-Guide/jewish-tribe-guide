// Shared form primitives used across all intake sections

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

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={inputClass} {...props} />
}

// ── Textarea ──────────────────────────────────────────────────────────────────

export function Textarea({
  rows = 3,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${inputClass} resize-none`} rows={rows} {...props} />
}

// ── Select ────────────────────────────────────────────────────────────────────

type SelectInputProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string }[]
  placeholder?: string
}

export function SelectInput({ options, placeholder = 'Select…', ...props }: SelectInputProps) {
  return (
    <div className="relative">
      <select className={`${inputClass} appearance-none pr-8`} {...props}>
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

export function SectionDivider({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="flex items-center gap-2 pt-6 pb-3 border-t border-slate-200 mt-2">
      <span aria-hidden="true">{icon}</span>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
    </div>
  )
}

// ── Service section wrapper (revealed sections) ───────────────────────────────

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
