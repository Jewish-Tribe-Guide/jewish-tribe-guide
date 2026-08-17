'use client'

import { useEffect, useState } from 'react'
import {
  FIELD_TYPES,
  FIELD_TYPE_SHAPE,
  TYPE_HAS_SHAPE_CHOICE,
  slugifyFieldKey,
  type CategoryField,
  type FieldType,
} from '@/lib/categories'
import { inputClass } from './CategoryFormFields'
import { parseOptions, serializeOptions } from './categoryEditorLogic'

// ── One field row in CategoryEditor's Details list ─────────────────────────

// The editor asks Name / Type / Show as / Required, plus (for Choice) whether
// a listing can hold more than one value; the filter + tag rules are implied
// and applied by normalizeField (categoryEditorLogic.ts) on save:
//   • Badge (Yes/No, Choice) → a filter. Row → display only, no filter.
//   • Hours → always the "Open now" filter.
//   • Tags → always chips + click-to-search (never a filter); their tag group is
//     derived from the name once, then frozen so a rename can't orphan tags.
// Note: the directory's *filter* for a Choice field always allows picking more
// than one value, regardless of `multiSelect` — that flag only controls how
// many values a single listing can be assigned (see CategoryField.multiSelect).
export function FieldEditor({
  field: f,
  index,
  total,
  canRequire,
  audienceOptions,
  showIfOptions,
  onChange,
  onRemove,
  onMove,
  hasCaveat,
  onToggleCaveat,
}: {
  field: CategoryField
  index: number
  total: number
  canRequire: boolean
  /** The category's own boolean fields this one could be scoped to — see
   *  CategoryField.audienceKey. Empty when the category has no boolean
   *  fields yet. */
  audienceOptions: { key: string; label: string }[]
  /** The category's own Choice fields this one could be shown conditionally
   *  on — see CategoryField.showIf. Empty when the category has no Choice
   *  fields yet (besides this one). */
  showIfOptions: { key: string; label: string; options: { value: string; label: string }[] }[]
  onChange: (patch: Partial<CategoryField>) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
  /** Whether this Choice field has a "flag exceptions" caveat pair wired up
   *  (see CategoryField.caveat) — e.g. Kosher Certification's "not
   *  everything here is kosher" checkbox + note. */
  hasCaveat: boolean
  onToggleCaveat: (on: boolean) => void
}) {
  // "Name" auto-fills the internal key only while it's still blank, then freezes,
  // so renaming a detail later never orphans its stored data.
  function onNameChange(name: string) {
    onChange(!f.key ? { label: name, key: slugifyFieldKey(name) } : { label: name })
  }

  // Choices textarea: kept as its own local, uncontrolled-feeling string
  // instead of round-tripping every keystroke through parseOptions →
  // serializeOptions. That round trip immediately trimmed each line and
  // dropped empty ones, so pressing Enter (a blank line) or typing a
  // trailing space in a multi-word choice got silently erased on the very
  // next render — Enter and Space effectively did nothing. Only parse (and
  // re-normalize) on blur, once the admin's done editing that line.
  const [choicesText, setChoicesText] = useState(() => serializeOptions(f.options))
  useEffect(() => {
    // The textbook fix for "reset state when a prop changes" is a `key` on
    // this component instead of this effect, but this component's list
    // already keys on the array slot (deliberately, for reorder stability —
    // see the comment above) — swapping that to `f.key` risks resetting
    // other local state in this editor on every reorder too, not just a
    // genuine field switch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoicesText(serializeOptions(f.options))
    // Only resync from the field's own saved options when switching to a
    // genuinely different field (its stable `key`, not the array index,
    // which stays the same slot across a reorder) — not on every render,
    // which would fight the admin's in-progress typing above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.key])

  // "Show as" is offered only for Yes/No and Choice — the types where badge-vs-row
  // is a real choice. Badge also means "this is a filter" (applied in
  // normalizeField); a row is display-only. Everything else has a fixed shape.
  const canChooseShape = TYPE_HAS_SHAPE_CHOICE(f.type)
  const showAs: 'badge' | 'row' = f.renderAs === 'row' ? 'row' : 'badge'

  function onTypeChange(type: FieldType) {
    // Reset to the type's natural shape; drop choices when leaving Choice
    // (options are also used by a fixed-vocabulary Tags field, so only clear
    // them when landing on neither).
    const patch: Partial<CategoryField> = { type, renderAs: FIELD_TYPE_SHAPE[type] }
    if (type !== 'select' && type !== 'tags') patch.options = undefined
    if (type !== 'select') patch.multiSelect = undefined
    if (type !== 'tags') {
      patch.expandedOnly = undefined
      patch.fixedVocabulary = undefined
    }
    onChange(patch)
  }

  const fieldLabel = 'block text-[11px] font-medium text-slate-600 mb-0.5'

  return (
    <div className="border border-slate-200 rounded-md p-3 bg-slate-50/50 space-y-2">
      <label className="block">
        <span className={fieldLabel}>Name</span>
        <input value={f.label} onChange={(e) => onNameChange(e.target.value)} className={inputClass} placeholder="e.g. Grades served" />
      </label>

      <label className="block sm:w-1/2">
        <span className={fieldLabel}>Type</span>
        <select value={f.type} onChange={(e) => onTypeChange(e.target.value as FieldType)} className={inputClass}>
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={fieldLabel}>Help text (optional)</span>
        <input
          value={f.help ?? ''}
          onChange={(e) => onChange({ help: e.target.value || undefined })}
          className={inputClass}
          placeholder="A short hint shown under this field in the form"
        />
      </label>

      {(f.type === 'select' || (f.type === 'tags' && f.fixedVocabulary)) && (
        <label className="block">
          <span className={fieldLabel}>Choices (one per line — “value | label”, or just value)</span>
          <textarea
            rows={3}
            value={choicesText}
            onChange={(e) => setChoicesText(e.target.value)}
            onBlur={(e) => onChange({ options: parseOptions(e.target.value) })}
            className={inputClass}
            placeholder={'Elementary\nMiddle\nHigh'}
          />
        </label>
      )}

      {f.type === 'select' && (
        <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={!!f.multiSelect}
            onChange={(e) => onChange({ multiSelect: e.target.checked })}
            className="rounded border-slate-300"
          />
          Allow more than one choice per listing (e.g. Restaurant + Catering)
        </label>
      )}

      {f.type === 'select' && (
        <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={!!f.allowOther}
            onChange={(e) => onChange({ allowOther: e.target.checked })}
            className="rounded border-slate-300"
          />
          Add an &ldquo;Other&rdquo; choice that lets them type their own answer
        </label>
      )}

      {f.type === 'select' && showAs === 'badge' && (
        <div>
          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={hasCaveat}
              onChange={(e) => onToggleCaveat(e.target.checked)}
              className="rounded border-slate-300"
            />
            Let a listing flag exceptions (e.g. &ldquo;not everything here is {f.label.toLowerCase() || 'this'}&rdquo;)
          </label>
          {hasCaveat && (
            <p className="text-[11px] text-muted mt-0.5 ml-5">
              Adds a Yes/No checkbox and a note field to each listing&rsquo;s edit form — when checked, the {f.label || 'this'} badge shows amber with the note as a caution.
            </p>
          )}
        </div>
      )}

      {f.type === 'url' && (
        <>
          <label className="block sm:w-1/2">
            <span className={fieldLabel}>Button text</span>
            <input
              value={f.linkLabel ?? ''}
              onChange={(e) => onChange({ linkLabel: e.target.value })}
              className={inputClass}
              placeholder="e.g. Join Group"
            />
            <span className="block text-[11px] text-muted mt-0.5">Defaults to the detail&rsquo;s name if left blank.</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={!!f.showInHeader}
              onChange={(e) => onChange({ showInHeader: e.target.checked })}
              className="rounded border-slate-300"
            />
            Also show as a button on the collapsed card, before the arrow
          </label>
        </>
      )}

      {(f.type === 'text' || f.type === 'textarea') && (
        <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={!!f.showInHeader}
            onChange={(e) => onChange({ showInHeader: e.target.checked })}
            className="rounded border-slate-300"
          />
          Also show on the collapsed card, under the address
        </label>
      )}
      {f.type === 'textarea' && f.showInHeader && (
        <p className="text-[11px] text-muted ml-5 -mt-1">
          Shown as a single line there, even on a long entry — keep it to about a sentence. Longer text still shows in full once the card is expanded.
        </p>
      )}

      {f.type === 'text' && f.showInHeader && (
        <div className="ml-5 -mt-1 space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={f.headerMaxLength != null}
              onChange={(e) => onChange({ headerMaxLength: e.target.checked ? 60 : undefined })}
              className="rounded border-slate-300"
            />
            Limit to one line (recommended)
          </label>
          {f.headerMaxLength != null ? (
            <>
              <label className="flex items-center gap-1.5 text-xs text-slate-700">
                Character limit
                <input
                  type="number"
                  min={10}
                  max={200}
                  value={f.headerMaxLength}
                  onChange={(e) => onChange({ headerMaxLength: Math.max(10, Number(e.target.value) || 60) })}
                  className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                />
              </label>
              <p className="text-[11px] text-muted">
                The submission form stops accepting more input at this length, so it&rsquo;s guaranteed to fit one line —
                nothing to truncate, so this detail won&rsquo;t repeat again once the card is expanded. ~60 fits most
                phone widths at this font size; raise it if that&rsquo;s cutting entries short in practice.
              </p>
            </>
          ) : (
            <p className="text-[11px] text-muted">
              Without a limit, a long entry truncates with &ldquo;&hellip;&rdquo; there, and still shows in full once
              the card is expanded.
            </p>
          )}
        </div>
      )}

      {canChooseShape && (
        <label className="block sm:w-1/2">
          <span className={fieldLabel}>Show as</span>
          <select value={showAs} onChange={(e) => onChange({ renderAs: e.target.value as 'badge' | 'row' })} className={inputClass}>
            <option value="badge">Badge — a chip, and a filter</option>
            <option value="row">Row — a labeled line</option>
          </select>
        </label>
      )}

      {audienceOptions.length > 0 && (
        <label className="block sm:w-1/2">
          <span className={fieldLabel}>Only show when this filter is on (optional)</span>
          <select
            value={f.audienceKey ?? ''}
            onChange={(e) => onChange({ audienceKey: e.target.value || undefined })}
            className={inputClass}
          >
            <option value="">Always show</option>
            {audienceOptions.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
          <span className="block text-[11px] text-muted mt-0.5">
            When a visitor turns on that filter, cards hide every other audience-scoped detail —
            useful for things like separate men&rsquo;s/women&rsquo;s hours so they don&rsquo;t all show
            at once.
          </span>
        </label>
      )}

      {showIfOptions.length > 0 && (
        <label className="block sm:w-1/2">
          <span className={fieldLabel}>Only show when a Choice equals (optional)</span>
          <select
            value={f.showIf ? `${f.showIf.field}::${String(f.showIf.equals)}` : ''}
            onChange={(e) => {
              if (!e.target.value) {
                onChange({ showIf: undefined })
                return
              }
              const sep = e.target.value.indexOf('::')
              onChange({ showIf: { field: e.target.value.slice(0, sep), equals: e.target.value.slice(sep + 2) } })
            }}
            className={inputClass}
          >
            <option value="">Always show</option>
            {showIfOptions.map((trigger) => (
              <optgroup key={trigger.key} label={trigger.label}>
                {trigger.options.map((opt) => (
                  <option key={`${trigger.key}::${opt.value}`} value={`${trigger.key}::${opt.value}`}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="block text-[11px] text-muted mt-0.5">
            Only shows this detail (in the form and on the card) on listings where that Choice
            includes the selected option — e.g. a &ldquo;Delivery WhatsApp Group&rdquo; link that only
            appears once Type includes &ldquo;Out of Town Deliveries.&rdquo;
          </span>
        </label>
      )}

      {f.audienceKey && (
        <label className="block sm:w-1/2">
          <span className={fieldLabel}>Short label in that section (optional)</span>
          <input
            value={f.shortLabel ?? ''}
            onChange={(e) => onChange({ shortLabel: e.target.value || undefined })}
            className={inputClass}
            placeholder="e.g. Phone"
          />
          <span className="block text-[11px] text-muted mt-0.5">
            Shown instead of the full name in the intake form&rsquo;s collapsible section (e.g.
            &ldquo;Phone&rdquo; instead of &ldquo;Women&rsquo;s Phone&rdquo;, since the section heading
            already says who it&rsquo;s for). The card still uses the full name above.
          </span>
        </label>
      )}

      <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          checked={!!f.coreSection}
          onChange={(e) => onChange({ coreSection: e.target.checked })}
          className="rounded border-slate-300"
        />
        Group with Address / Name / Phone at the top of the form
      </label>
      {f.coreSection && (
        <p className="text-[11px] text-muted ml-5 -mt-1">
          For a field Google fills in the same way it does Name/Phone/Hours when someone picks an address — keeps
          everything auto-filled together, above the line where the rest of this category&rsquo;s fields start.
        </p>
      )}

      {canRequire && (
        <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
          <input type="checkbox" checked={!!f.required} onChange={(e) => onChange({ required: e.target.checked })} className="rounded border-slate-300" />
          Required when adding a listing
        </label>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-2 mt-1">
        <button onClick={() => onMove(-1)} disabled={index === 0} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer" aria-label="Move detail up">↑</button>
        <button onClick={() => onMove(1)} disabled={index === total - 1} className="text-xs text-muted hover:text-slate-700 disabled:opacity-30 cursor-pointer" aria-label="Move detail down">↓</button>
        <button onClick={onRemove} className="text-xs text-red-600 hover:underline cursor-pointer ml-2">Remove</button>
      </div>
    </div>
  )
}
