'use client'

import { useMemo, useState } from 'react'
import {
  BUILT_IN_TAB_TARGETS,
  MAX_MOBILE_TABS,
  type MobileTabConfig,
} from '@/lib/siteSettings'
import { CategoryGlyph, hasCategoryIcon } from '@/lib/categoryIcons'
import { useCategoriesIfAny } from '@/lib/contentContext'
import { kindKeyById } from '@/lib/placeKinds'
import { builtInTabIcon } from '../MobileTabBar'
import { useCardOptions } from './useCardOptions'
import DragList, { AddMenu, OrderRow } from './DragList'

// ── The mobile bottom tab bar editor ─────────────────────────────────────────
// Phone-only. The bar is the mobile counterpart of the desktop featured-card
// row: a handful of shortcuts into the same categories and forms the home
// screen already lists, plus the three whole-app screens that have always
// been there (the card grid, the map, the feedback form).
//
// Reuses useCardOptions — the same list the featured-card picker and the
// section manager draw from — so a tab can point anywhere those can, and a
// newly added category shows up here without touching this file.

/** Labels for the built-in destinations, which aren't in useCardOptions
 *  (they're app screens, not cards). */
const BUILT_IN_LABELS: Record<string, string> = {
  categories: 'Home / all categories',
  map: 'Map',
  feedback: 'Feedback form',
  browse: 'Browse (every category, grouped)',
  you: 'You (saved places and searches)',
}

/** What a row says its tab opens, as the bar's own screens are called. */
const OPENS: Record<string, string> = {
  categories: 'the home page',
  map: 'the Map',
  feedback: 'the Feedback form',
  browse: 'the Browse page',
  you: 'You',
}

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

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
  const categories = useCategoriesIfAny()
  const [openId, setOpenId] = useState<string | null>(null)

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
    setOpenId(null)
    onChange(tabs.filter((t) => t.id !== id))
  }

  function add(target: string) {
    if (!target || tabs.length >= MAX_MOBILE_TABS) return
    // Seed the label from the destination's own name — almost always what's
    // wanted, and still editable once the row is open.
    const id = newTabId()
    onChange([...tabs, { id, label: targetLabel(target), target }])
    setOpenId(id)
  }

  const hasBrowse = tabs.some((t) => t.target === 'browse')

  return (
    <div>
      {tabs.length === 0 && (
        <p className="m-0 px-4 pt-3 text-xs text-red-600">
          The bar needs at least one tab — add one below, or visitors lose their way back.
        </p>
      )}

      {/* Each tab one row with its icon, dragged into order (note 28). */}
      <DragList items={tabs} keyOf={(t) => t.id} nameOf={(t) => t.label || targetLabel(t.target)} onReorder={onChange}>
        {(tab, row) => {
          const open = openId === tab.id
          const Icon = builtInTabIcon(tab.target, hasBrowse)
          return (
            <OrderRow
              row={row}
              name={tab.label || targetLabel(tab.target)}
              line={`Opens ${OPENS[tab.target] ?? targetLabel(tab.target)}`}
              icon={
                Icon ? (
                  <Icon className="h-[22px] w-[22px]" />
                ) : hasCategoryIcon(kindKeyById(tab.target, categories)) ? (
                  <CategoryGlyph categoryId={tab.target} icon="" className="h-[22px] w-[22px]" />
                ) : undefined
              }
              open={open}
              onToggle={() => setOpenId(open ? null : tab.id)}
              rename={{ value: tab.label, placeholder: 'Shown under the icon', onChange: (label) => update(tab.id, { label }) }}
              onRemove={() => remove(tab.id)}
            >
              <label className="block">
                <span className="block text-[13px] font-semibold text-slate-700 mb-1">Opens</span>
                <select value={tab.target} onChange={(e) => update(tab.id, { target: e.target.value })} className={inputClass}>
                  {/* The current target stays selectable even though it's
                      "taken" — by this very row. */}
                  <option value={tab.target}>{targetLabel(tab.target)}</option>
                  {available.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </OrderRow>
          )
        }}
      </DragList>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
        {tabs.length >= MAX_MOBILE_TABS ? (
          <p className="m-0 text-[13px] text-slate-600">Five tabs at most. Take one off to add another.</p>
        ) : available.length === 0 ? (
          <p className="m-0 text-[13px] text-slate-600">Every place a tab can open is on the bar.</p>
        ) : (
          <AddMenu label="+ Add a tab" options={available} onPick={add} />
        )}
      </div>
    </div>
  )
}
