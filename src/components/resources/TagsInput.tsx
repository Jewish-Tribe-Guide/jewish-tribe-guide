'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CategoryField } from '@/lib/categories'
import { useActiveCommunity } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'

type Props = {
  field: CategoryField
  /** Tags that are always available. */
  value: string[]
  onChange: (value: string[]) => void
  /** Tags that are only sometimes available. */
  sometimes?: string[]
  onChangeSometimes?: (value: string[]) => void
}

// Multi-select for a `type: 'tags'` field: pick from the vocabulary or type a new
// item. Values are stored as labels (e.g. "Kosher Cheese") on the listing.
// Each selected tag can be toggled between "always" (green) and "sometimes" (amber)
// by clicking the chip itself; × removes it entirely.
//
// A field with `fixedVocabulary` is closed — its vocab comes straight from the
// admin-authored `field.options` (no fetch, no shared cross-listing growth),
// and there's no "+ Add new" — only picking from that list. Otherwise (the
// default, and every tags field before this existed) the vocabulary is the
// open, shared `tagGroup` list from the API, and anyone can add a new tag,
// which then joins that vocabulary for future submitters too.
export default function TagsInput({ field, value, onChange, sometimes = [], onChangeSometimes }: Props) {
  const [fetchedVocab, setFetchedVocab] = useState<string[]>([])
  const [input, setInput] = useState('')
  const always = value ?? []
  const showConsistency = !!onChangeSometimes
  const vocab = field.fixedVocabulary ? (field.options ?? []).map((o) => o.label) : fetchedVocab
  const communitySlug = useActiveCommunity().community?.slug ?? ''

  useEffect(() => {
    if (field.fixedVocabulary) return
    if (!field.tagGroup) return
    let cancelled = false
    fetch(withCommunity(`/api/tags?group=${encodeURIComponent(field.tagGroup)}`, communitySlug))
      .then((r) => r.json())
      .then((b) => {
        if (!cancelled && b.ok) setFetchedVocab((b.tags as { label: string }[]).map((t) => t.label))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [field.tagGroup, field.fixedVocabulary, communitySlug])

  const add = (label: string) => {
    const v = label.trim()
    if (!v) return
    // A fixed-vocabulary field can only ever add something already in its
    // admin-set list — guards the Enter-key path too, not just the hidden
    // "+ Add new" button.
    if (field.fixedVocabulary && !vocab.some((t) => t.toLowerCase() === v.toLowerCase())) return
    if (!always.some((s) => s.toLowerCase() === v.toLowerCase()) &&
        !sometimes.some((s) => s.toLowerCase() === v.toLowerCase())) {
      onChange([...always, v])
    }
    setInput('')
  }

  const removeAlways = (label: string) => onChange(always.filter((s) => s !== label))
  const removeSometimes = (label: string) => onChangeSometimes?.(sometimes.filter((s) => s !== label))

  const moveToSometimes = (label: string) => {
    onChange(always.filter((s) => s !== label))
    onChangeSometimes?.([...sometimes, label])
  }
  const moveToAlways = (label: string) => {
    onChangeSometimes?.(sometimes.filter((s) => s !== label))
    onChange([...always, label])
  }

  const q = input.trim().toLowerCase()
  const allSelected = [...always, ...sometimes]
  const suggestions = useMemo(
    () =>
      vocab
        .filter((t) => !allSelected.some((s) => s.toLowerCase() === t.toLowerCase()))
        .filter((t) => !q || t.toLowerCase().includes(q))
        .slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vocab, always, sometimes, q],
  )

  const canAddNew = !field.fixedVocabulary && q &&
    !vocab.some((t) => t.toLowerCase() === q) &&
    !allSelected.some((s) => s.toLowerCase() === q)

  return (
    <div>
      <label htmlFor={`tags-input-${field.key}`} className="block text-sm font-medium text-slate-700 mb-1">{field.label}</label>
      {field.help && <p className="text-xs text-muted mb-1.5">{field.help}</p>}

      {(always.length > 0 || sometimes.length > 0) && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {always.map((label) => (
            <span key={label} className="inline-flex items-center gap-1 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full pl-2 pr-1 py-0.5">
              {showConsistency ? (
                <button
                  type="button"
                  onClick={() => moveToSometimes(label)}
                  title="Always available — click to mark as sometimes"
                  className="hover:opacity-70 transition-opacity cursor-pointer"
                >
                  {label}
                </button>
              ) : label}
              <button type="button" onClick={() => removeAlways(label)} aria-label={`Remove ${label}`} className="hover:bg-green-100 rounded-full w-4 h-4 flex items-center justify-center cursor-pointer">
                ×
              </button>
            </span>
          ))}
          {sometimes.map((label) => (
            <span key={label} className="inline-flex items-center gap-1 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full pl-2 pr-1 py-0.5">
              <button
                type="button"
                onClick={() => moveToAlways(label)}
                title="Sometimes available — click to mark as always"
                className="hover:opacity-70 transition-opacity cursor-pointer"
              >
                ~{label}
              </button>
              <button type="button" onClick={() => removeSometimes(label)} aria-label={`Remove ${label}`} className="hover:bg-amber-100 rounded-full w-4 h-4 flex items-center justify-center cursor-pointer">
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {showConsistency && (always.length > 0 || sometimes.length > 0) && (
        <p className="text-xs text-muted mb-2">
          <span className="text-green-700 font-medium">Green</span> = always in stock · Click a tag to toggle to <span className="text-amber-600 font-medium">~sometimes</span>
        </p>
      )}

      <input
        id={`tags-input-${field.key}`}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add(input)
          }
        }}
        placeholder={field.fixedVocabulary ? 'Type to search…' : 'Type to search or add an item…'}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
      />

      {(suggestions.length > 0 || canAddNew) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {suggestions.map((t) => (
            <button key={t} type="button" onClick={() => add(t)} className="text-xs bg-slate-100 text-slate-700 rounded-full px-2.5 py-1 hover:bg-slate-200 transition-colors cursor-pointer">
              + {t}
            </button>
          ))}
          {canAddNew && (
            <button type="button" onClick={() => add(input)} className="text-xs bg-primary/10 text-primary rounded-full px-2.5 py-1 hover:bg-primary/20 transition-colors cursor-pointer">
              + Add &ldquo;{input.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  )
}
