'use client'

import { useMemo } from 'react'
import {
  BUILT_IN_TAB_TARGETS,
  MAX_MOBILE_TABS,
  isBuiltInTabTarget,
  type MobileTabConfig,
} from '@/lib/siteSettings'
import { useCardOptions } from './HomeSectionManager'

// ── The mobile bottom tab bar editor ─────────────────────────────────────────
// Phone-only. The bar is the mobile counterpart of the desktop featured-card
// row: a handful of shortcuts into the same categories and forms the home
// screen already lists, plus the three whole-app screens that have always
// been there (the card grid, the map, the feedback form).
//
// Reuses useCardOptions — the same list the featured-card picker and the
// section manager draw from — so a tab can point anywhere those can, and a
// newly added category shows up here without touching this file.

/** Labels for the three built-in destinations, which aren't in useCardOptions
 *  (they're app screens, not cards). */
const BUILT_IN_LABELS: Record<string, string> = {
  categories: 'Home / all categories',
  map: 'Map',
  feedback: 'Feedback form',
}

/** Ids must survive renames, so they're minted once and never derived from the
 *  label or target. */
function newTabId(): string {
  return `tab_${Math.random().toString(36).slice(2, 9)}`
}

export default function MobileTabsEditor({
  tabs,
  onChange,
}: {
  tabs: MobileTabConfig[]
  onChange: (tabs: MobileTabConfig[]) => void
}) {
  const cardOptions = useCardOptions()

  const targetLabel = useMemo(() => {
    const byId = new Map(cardOptions.map((c) => [c.id, c.label]))
    return (target: string) => BUILT_IN_LABELS[target] ?? byId.get(target) ?? target
  }, [cardOptions])

  // A destination already on the bar can't be picked again — two tabs pointing
  // at the same screen would both light up as active.
  const taken = new Set(tabs.map((t) => t.target))

  const available = [
    ...BUILT_IN_TAB_TARGETS.filter((t) => !taken.has(t)).map((t) => ({ id: t, label: BUILT_IN_LABELS[t] })),
    ...cardOptions.filter((c) => !taken.has(c.id)),
  ]

  function update(id: string, patch: Partial<MobileTabConfig>) {
    onChange(tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  function remove(id: string) {
    onChange(tabs.filter((t) => t.id !== id))
  }

  function move(index: number, delta: number) {
    const next = [...tabs]
    const dest = index + delta
    if (dest < 0 || dest >= next.length) return
    ;[next[index], next[dest]] = [next[dest], next[index]]
    onChange(next)
  }

  function add(target: string) {
    if (!target || tabs.length >= MAX_MOBILE_TABS) return
    // Seed the label from the destination's own name — almost always what's
    // wanted, and still editable right there in the row.
    onChange([...tabs, { id: newTabId(), label: targetLabel(target), target }])
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
      <p className="text-[11px] text-muted">
        The bar pinned to the bottom of every screen on a phone. Desktop has no tab bar and ignores
        this. Up to {MAX_MOBILE_TABS} tabs — past that the labels stop being readable.
      </p>

      {tabs.length === 0 && (
        <p className="text-xs text-red-600">
          The bar needs at least one tab — add one below, or visitors lose their way back.
        </p>
      )}

      <ul className="space-y-2">
        {tabs.map((tab, i) => (
          <li key={tab.id} className="flex items-start gap-2 rounded-md border border-slate-200 p-2">
            <div className="flex flex-col gap-0.5 pt-1">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Move ${tab.label} earlier`}
                className="text-xs leading-none text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-400 cursor-pointer disabled:cursor-default"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === tabs.length - 1}
                aria-label={`Move ${tab.label} later`}
                className="text-xs leading-none text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-400 cursor-pointer disabled:cursor-default"
              >
                ▼
              </button>
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <label className="block">
                <span className="block text-[11px] font-medium text-slate-600 mb-1">Label</span>
                <input
                  value={tab.label}
                  onChange={(e) => update(tab.id, { label: e.target.value })}
                  placeholder="Shown under the icon"
                  className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-slate-600 mb-1">Opens</span>
                <select
                  value={tab.target}
                  onChange={(e) => update(tab.id, { target: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {/* The current target stays selectable even though it's
                      "taken" — by this very row. */}
                  <option value={tab.target}>{targetLabel(tab.target)}</option>
                  {available.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {!isBuiltInTabTarget(tab.target) && (
                  <span className="block text-[11px] text-muted mt-1">
                    Uses this destination&rsquo;s own emoji as the tab icon.
                  </span>
                )}
              </label>
            </div>

            <button
              type="button"
              onClick={() => remove(tab.id)}
              className="shrink-0 text-xs text-muted hover:text-red-600 transition-colors cursor-pointer pt-1"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {tabs.length >= MAX_MOBILE_TABS ? (
        <p className="text-[11px] text-muted">
          That&rsquo;s the {MAX_MOBILE_TABS}-tab maximum. Remove one to add another.
        </p>
      ) : available.length === 0 ? (
        <p className="text-[11px] text-muted">Every available destination is already on the bar.</p>
      ) : (
        <label className="block">
          <span className="block text-[11px] font-medium text-slate-600 mb-1">Add a tab</span>
          <select
            value=""
            onChange={(e) => add(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Choose a destination…</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
