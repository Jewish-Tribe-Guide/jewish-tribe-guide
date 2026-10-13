'use client'

import { useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from 'react'
import { selectValues, type CategoryField } from '@/lib/categories'
import { formatPhone, normalizeUrl } from '@/lib/validation'
import TagsInput from './TagsInput'
import ContactsInput from './ContactsInput'
import ImageUploadField from '@/components/ImageUploadField'
import HoursInput from '@/components/intake/HoursInput'
import MinyanimInput from '@/components/intake/MinyanimInput'
import SchedulesInput from '@/components/intake/SchedulesInput'
import type { SpecialSchedule } from '@/lib/schedules'

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary'

/** One detail field's input, by type. ListingEditor edits most fields in
 *  their listing-shaped place but uses this for the ones whose editor is the
 *  same either way (yes/no answers, the kosher caveat's question and note,
 *  and any field type it has no layout for); BoxEditor, the "+ Add" box
 *  (TellUsSheet) and the admin's SubmissionReview use it for every field. */
/** A textarea as tall as what's in it, three lines at least: a mikvah's
 *  note or an About ran past its three lines and scrolled inside the box,
 *  its end out of sight (the user, Oct 11). */
function GrowingTextarea({ value, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    // Not while it's hidden: it has no height to measure then.
    if (!el || el.scrollHeight === 0) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [value])
  return <textarea ref={ref} value={value} {...rest} />
}

export function DetailFieldInput({
  field,
  labelOverride,
  labelHidden = false,
  value,
  onChange,
  sometimes,
  onChangeSometimes,
  schedules,
  onChangeSchedules,
}: {
  field: CategoryField
  /** Shown instead of field.label — used inside an audience section so
   *  "Women's Phone" reads as just "Phone" under the "Women's" heading. */
  labelOverride?: string
  /** For screen readers only: the box around it already says it (an
   *  editor row of one field, "Hours" under "Hours"). */
  labelHidden?: boolean
  value: unknown
  onChange: (value: unknown) => void
  sometimes?: string[]
  onChangeSometimes?: (v: string[]) => void
  /** A minyanim field's special schedules (schedules.ts), edited with it. */
  schedules?: unknown
  onChangeSchedules?: (v: SpecialSchedule[]) => void
}) {
  const label = `${labelOverride ?? field.label}${field.required ? ' *' : ''}`
  const labelClass = labelHidden ? 'sr-only' : 'block text-sm font-medium text-slate-700 mb-1'

  if (field.type === 'tags') {
    return (
      <TagsInput
        field={field}
        value={(value as string[]) ?? []}
        onChange={onChange}
        sometimes={sometimes}
        onChangeSometimes={onChangeSometimes}
      />
    )
  }

  if (field.type === 'url') {
    return (
      <div>
        <label htmlFor={`detail-${field.key}`} className={labelClass}>{label}</label>
        <input
          id={`detail-${field.key}`}
          type="url"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          // Adds "https://" once they're done typing — almost nobody types the
          // scheme by hand, but doing this on every keystroke (instead of on
          // blur) would fight typing/pasting a real https:// URL mid-edit.
          onBlur={(e) => onChange(normalizeUrl(e.target.value))}
          placeholder={field.placeholder ?? 'example.com'}
          className={inputClass}
        />
        {field.help && <p className="text-xs text-muted mt-1">{field.help}</p>}
      </div>
    )
  }

  if (field.type === 'image') {
    return (
      <div>
        <span className={labelClass}>{labelOverride ?? field.label}</span>
        {/* Every other field type gets its visual weight for free — a
            select/textarea/input is browser-rendered with its own border.
            The photo picker is several loose pieces (a preview, three
            buttons, a hint line) with no such border of its own, so next to
            a stack of bordered fields it read as scattered UI rather than
            one field — same reasoning the boolean checkbox got its own box
            for earlier. */}
        <div className="rounded-md border border-slate-300 p-3">
          <ImageUploadField
            value={(value as string) ?? ''}
            onChange={onChange}
            uploadUrl="/api/submissions/photo"
            // Wherever this photo actually renders (CategoryIcon's callers —
            // map pins, listing cards, place detail) it's always circular, so
            // the crop step's own guide has to match that, not show a square
            // shape and let corners the visitor thinks are kept quietly get
            // clipped away later.
            shape="circle"
            // No helpText ("Shown instead of the category's usual icon…") —
            // same self-explanatory-copy trim as the reposition hint below:
            // it becomes obvious once there's a photo, and the field is
            // already labeled "Photo *". No collapseUrlInput exception here
            // (admin's own uploaders keep the URL row always visible) — most
            // visitors upload a file, so a permanently-visible label+input for
            // that edge case was exactly the bulk this field didn't need.
            showRepositionHint={false}
            collapseUrlInput
          />
        </div>
      </div>
    )
  }

  if (field.type === 'boolean') {
    return (
      <div>
        {/* A title above the box, same as every other field type (select,
            input, textarea) — a checkbox used to be the one field with no
            title line at all, just a box whose only content was the label
            repeated next to the checkbox. Reported live as awkward once it
            sat next to titled fields for real, especially alone in a box of
            its own. */}
        <span className={labelClass}>{label}</span>
        {/* Two buttons, Yes and No (the user, Oct 10), where it was a
            switch. A switch is for turning something on or off (the
            Filters sheet's "Shabbat friendly" shows only those); this is
            answering a question, and a switch's off read as "No" when
            nobody had said so. The same look as the minyan editor's "Clock
            time / From a zman". Unanswered, neither is chosen. */}
        {/* invertDisplay (see its own doc on CategoryField): shows the
            logical opposite of the stored value — Yes still stores what
            the field means by yes, only what's RENDERED from it differs.
            An inverted field with no answer yet reads as "Yes", the
            friendlier default a positively-phrased question like
            "Everything here is kosher?" wants, rather than opening on a
            negative "No" nobody chose. */}
        {(() => {
          const answered = field.invertDisplay || value === true || value === false
          const displayValue = field.invertDisplay ? !value : !!value
          return (
            <div className="flex gap-1 rounded-xl bg-slate-100 p-[3px]" role="group" aria-label={labelOverride ?? field.label}>
              {([true, false] as const).map((yes) => {
                const on = answered && displayValue === yes
                return (
                  <button
                    key={String(yes)}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange(field.invertDisplay ? !yes : yes)}
                    className={`h-10 flex-1 cursor-pointer rounded-[10px] text-[14.5px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? 'bg-white font-bold text-slate-900 shadow-sm' : 'font-semibold text-muted'}`}
                  >
                    {yes ? 'Yes' : 'No'}
                  </button>
                )
              })}
            </div>
          )
        })()}
        {/* Flush left, matching every other field's help text (no more
            ml-6 offset to align under the label past the checkbox — the
            whole control is boxed now, so this reads as "about the box
            above", same as a select or text field's help line). */}
        {field.help && <p className="text-xs text-muted mt-1">{field.help}</p>}
      </div>
    )
  }

  if (field.type === 'hours') {
    return <HoursInput label={label} labelHidden={labelHidden} value={value} onChange={onChange} />
  }

  if (field.type === 'contacts') {
    return <ContactsInput field={field} label={label} value={value} onChange={onChange} />
  }

  if (field.type === 'minyanim') {
    return (
      <>
        <MinyanimInput label={label} value={value} onChange={onChange} />
        {onChangeSchedules && <SchedulesInput value={schedules} onChange={onChangeSchedules} />}
      </>
    )
  }

  if (field.type === 'textarea') {
    return (
      <div>
        <label htmlFor={`detail-${field.key}`} className={labelClass}>{label}</label>
        <GrowingTextarea id={`detail-${field.key}`} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={field.placeholder} className={inputClass} />
        {field.help && <p className="text-xs text-muted mt-1">{field.help}</p>}
      </div>
    )
  }

  if (field.type === 'select' && field.multiSelect) {
    return <MultiSelectField field={field} label={label} labelHidden={labelHidden} value={value} onChange={onChange} />
  }

  if (field.type === 'select' && field.allowOther) {
    return <SelectOtherField field={field} label={label} labelHidden={labelHidden} value={value} onChange={onChange} />
  }

  if (field.type === 'select') {
    return (
      <div>
        <label htmlFor={`detail-${field.key}`} className={labelClass}>{label}</label>
        <select id={`detail-${field.key}`} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">Select…</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {field.help && <p className="text-xs text-muted mt-1">{field.help}</p>}
      </div>
    )
  }

  return (
    <div>
      <label htmlFor={`detail-${field.key}`} className={labelClass}>{label}</label>
      <input
        id={`detail-${field.key}`}
        type={field.type === 'number' ? 'number' : field.type === 'tel' ? 'tel' : 'text'}
        value={(value as string) ?? ''}
        onChange={(e) =>
          onChange(
            field.type === 'number'
              ? Number(e.target.value)
              // Same live formatting as the main Phone field (see formatPhone)
              // — a category's own "Women's Phone"-style field shouldn't look
              // different just because it isn't the built-in one.
              : field.type === 'tel'
                ? formatPhone(e.target.value)
                : e.target.value,
          )
        }
        placeholder={field.placeholder}
        // Only meaningful for type: 'text' (see CategoryField.headerMaxLength)
        // — a plain <input> can't contain a newline in the first place, so
        // this is purely the character cap, guaranteeing the value fits the
        // collapsed card's one line without any CSS truncation needed.
        maxLength={field.type === 'text' ? field.headerMaxLength : undefined}
        className={inputClass}
      />
      {field.help && <p className="text-xs text-muted mt-1">{field.help}</p>}
      {field.type === 'text' && field.headerMaxLength != null && (
        <p className="text-xs text-muted mt-1">
          {((value as string) ?? '').length}/{field.headerMaxLength}
        </p>
      )}
    </div>
  )
}

// A single-value Choice field with an "Other…" option (see
// CategoryField.allowOther) — its own component (not just another branch in
// DetailFieldInput) because it needs its own local state: whether the
// free-text box is showing. Starts open if the saved value doesn't match any
// of the field's own options — an edit of a listing whose value came from a
// choice the admin has since renamed or removed reopens with that value
// still there, in the box, instead of silently discarding it back to blank.
function SelectOtherField({
  field,
  label,
  labelHidden = false,
  value,
  onChange,
}: {
  field: CategoryField
  label: string
  labelHidden?: boolean
  value: unknown
  onChange: (value: unknown) => void
}) {
  const strValue = (value as string) ?? ''
  const isKnownOption = (field.options ?? []).some((opt) => opt.value === strValue)
  const [showOther, setShowOther] = useState(strValue !== '' && !isKnownOption)

  return (
    <div>
      <label htmlFor={`detail-${field.key}`} className={labelHidden ? 'sr-only' : 'block text-sm font-medium text-slate-700 mb-1'}>{label}</label>
      <select
        id={`detail-${field.key}`}
        value={showOther ? OTHER_OPTION_VALUE : strValue}
        onChange={(e) => {
          if (e.target.value === OTHER_OPTION_VALUE) {
            setShowOther(true)
            onChange('')
          } else {
            setShowOther(false)
            onChange(e.target.value)
          }
        }}
        className={inputClass}
      >
        <option value="">Select…</option>
        {field.options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        <option value={OTHER_OPTION_VALUE}>Other…</option>
      </select>
      {showOther && (
        <input
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Please specify"
          autoFocus
          className={`${inputClass} mt-2`}
        />
      )}
      {field.help && <p className="text-xs text-muted mt-1">{field.help}</p>}
    </div>
  )
}

// Never a real option value (admin-typed choices come from free text, but a
// literal match is astronomically unlikely and harmless either way — worst
// case, that one choice can't be selected without going through the "Other"
// box, which still saves the same string). Not persisted anywhere itself;
// it only ever exists as this <select>'s transient value.
const OTHER_OPTION_VALUE = '__other__'

// Badge-shown choice fields always allow more than one value on a single
// listing (e.g. a place that's both a Restaurant and a Caterer) — see
// `selectValues` for why the stored shape can still be a bare string on
// older listings.
//
// A real closed dropdown (like SelectOtherField's <select>), not
// always-expanded pills sitting inline — this is the intake/edit form, and a
// long Choice field (Kosher Certification's 10+ options) shouldn't push
// every other field down the page just to show its own state. Closed, it
// reads as a single boxed control with a summary of what's picked, exactly
// like any other field here; open, it's a checklist popover (plus an
// "Other…" row when the field allows it — see CategoryField.allowOther).
// Only the form uses this: filtering a list is the Filters sheet's job
// (FiltersSheet, MapFiltersSheet), a different purpose (narrowing a list,
// not entering a value).
function MultiSelectField({
  field,
  label,
  labelHidden = false,
  value,
  onChange,
}: {
  field: CategoryField
  label: string
  labelHidden?: boolean
  value: unknown
  onChange: (value: unknown) => void
}) {
  const chosen = selectValues(value)
  const options = field.options ?? []
  const knownValues = new Set(options.map((opt) => opt.value))
  // Already-chosen values that aren't one of the field's own options — e.g.
  // someone typed "Vegan Certification" into Other on a previous edit. Shown
  // as their own checked rows alongside the regular ones, so a custom pick
  // from before doesn't just vanish the next time this listing is edited.
  const customChosen = chosen.filter((v) => !knownValues.has(v))
  const [open, setOpen] = useState(false)
  const [addingOther, setAddingOther] = useState(false)
  const [otherText, setOtherText] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setAddingOther(false)
      }
    }
    document.addEventListener('mousedown', handleClick, true)
    document.addEventListener('touchstart', handleClick, true)
    return () => {
      document.removeEventListener('mousedown', handleClick, true)
      document.removeEventListener('touchstart', handleClick, true)
    }
  }, [open])

  function toggle(v: string) {
    onChange(chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v])
  }
  function labelFor(v: string): string {
    return options.find((opt) => opt.value === v)?.label ?? v
  }
  function commitOther() {
    const v = otherText.trim()
    setAddingOther(false)
    setOtherText('')
    if (!v || chosen.includes(v)) return
    onChange([...chosen, v])
  }

  const summary = chosen.length > 0 ? chosen.map(labelFor).join(', ') : 'Select…'

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={`detail-${field.key}`} className={labelHidden ? 'sr-only' : 'block text-sm font-medium text-slate-700 mb-1'}>{label}</label>
      <button
        id={`detail-${field.key}`}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`${inputClass} flex items-center justify-between gap-2 text-left ${chosen.length === 0 ? 'text-slate-400' : ''}`}
      >
        <span className="truncate">{summary}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-300 bg-white py-1 shadow-lg">
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={chosen.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="accent-primary h-3.5 w-3.5 shrink-0 cursor-pointer"
              />
              {opt.label}
            </label>
          ))}
          {customChosen.map((v) => (
            <label
              key={v}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked
                onChange={() => toggle(v)}
                className="accent-primary h-3.5 w-3.5 shrink-0 cursor-pointer"
              />
              {v}
            </label>
          ))}
          {field.allowOther && (
            addingOther ? (
              <div className="flex gap-1.5 px-3 py-2">
                <input
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commitOther()
                    } else if (e.key === 'Escape') {
                      setAddingOther(false)
                      setOtherText('')
                    }
                  }}
                  placeholder="Type your own…"
                  autoFocus
                  className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={commitOther}
                  className="shrink-0 text-xs font-medium text-primary hover:underline cursor-pointer"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingOther(true)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 cursor-pointer"
              >
                + Other…
              </button>
            )
          )}
        </div>
      )}
      {field.help && <p className="text-xs text-muted mt-1">{field.help}</p>}
    </div>
  )
}
