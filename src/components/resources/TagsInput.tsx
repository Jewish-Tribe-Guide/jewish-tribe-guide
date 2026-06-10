'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CategoryField } from '@/lib/categories'

type Props = {
  field: CategoryField
  value: string[]
  onChange: (value: string[]) => void
}

// Multi-select for a `type: 'tags'` field: pick from the vocabulary or type a new
// item. Values are stored as labels (e.g. "Kosher Cheese") on the listing.
export default function TagsInput({ field, value, onChange }: Props) {
  const [vocab, setVocab] = useState<string[]>([])
  const [input, setInput] = useState('')
  const selected = value ?? []

  useEffect(() => {
    if (!field.tagGroup) return
    let cancelled = false
    fetch(`/api/tags?group=${encodeURIComponent(field.tagGroup)}`)
      .then((r) => r.json())
      .then((b) => {
        if (!cancelled && b.ok) setVocab((b.tags as { label: string }[]).map((t) => t.label))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [field.tagGroup])

  const add = (label: string) => {
    const v = label.trim()
    if (!v) return
    if (!selected.some((s) => s.toLowerCase() === v.toLowerCase())) onChange([...selected, v])
    setInput('')
  }
  const remove = (label: string) => onChange(selected.filter((s) => s !== label))

  const q = input.trim().toLowerCase()
  const suggestions = useMemo(
    () =>
      vocab
        .filter((t) => !selected.some((s) => s.toLowerCase() === t.toLowerCase()))
        .filter((t) => !q || t.toLowerCase().includes(q))
        .slice(0, 8),
    [vocab, selected, q],
  )

  const canAddNew = q && !vocab.some((t) => t.toLowerCase() === q) && !selected.some((s) => s.toLowerCase() === q)

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{field.label}</label>
      {field.help && <p className="text-xs text-muted mb-1.5">{field.help}</p>}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((label) => (
            <span key={label} className="inline-flex items-center gap-1 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full pl-2 pr-1 py-0.5">
              {label}
              <button type="button" onClick={() => remove(label)} aria-label={`Remove ${label}`} className="hover:bg-green-100 rounded-full w-4 h-4 flex items-center justify-center cursor-pointer">
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add(input)
          }
        }}
        placeholder="Type to search or add an item…"
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
              + Add “{input.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}
