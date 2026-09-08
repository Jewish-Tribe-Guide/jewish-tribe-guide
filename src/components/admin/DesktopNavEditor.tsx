'use client'

import { useMemo } from 'react'
import {
  BUILT_IN_DESKTOP_LINK_TARGETS,
  isBuiltInDesktopLinkTarget,
  type DesktopNavItem,
} from '@/lib/siteSettings'
import { useCardOptions } from './HomeSectionManager'

// ── The desktop header's top nav editor — Categories / Map / More by
// default, now add/rename/reorder/remove-able the same way MobileTabsEditor
// already lets the mobile tab bar be. Replaces what used to be a fully
// hardcoded structure in HeaderNav.tsx (including the More panel's own
// About/Feedback/Privacy sub-items, which nest one level in here as a
// 'more-menu' item's own `items` list — see DesktopNavItem's own doc).
//
// 'categories-menu' is the one fixed built-in that isn't a link at all —
// it's the mega-menu driven by Home page sections (Site tab), so it has no
// "Opens" destination to pick; renaming it is still allowed (it's just a
// label on a trigger), same as any other item.
//
// Reuses useCardOptions — the same list the featured-card picker, the
// mobile tab bar, and the section manager all draw from — so a top-level or
// More-panel item can point anywhere those can, and a newly added category
// shows up here without touching this file. ─────────────────────────────────

const BUILT_IN_LABELS: Record<string, string> = {
  map: 'Map',
  about: 'About page',
  privacy: 'Privacy page',
  feedback: 'Feedback form',
}

function newItemId(): string {
  return `nav_${Math.random().toString(36).slice(2, 9)}`
}

function targetLabelFn(cardOptions: ReturnType<typeof useCardOptions>) {
  const byId = new Map(cardOptions.map((c) => [c.id, c.label]))
  return (target: string) => BUILT_IN_LABELS[target] ?? byId.get(target) ?? target
}

const rowInputClass =
  'w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

export default function DesktopNavEditor({
  items,
  onChange,
}: {
  items: DesktopNavItem[]
  onChange: (items: DesktopNavItem[]) => void
}) {
  const cardOptions = useCardOptions()
  const targetLabel = useMemo(() => targetLabelFn(cardOptions), [cardOptions])

  const hasCategoriesMenu = items.some((i) => i.kind === 'categories-menu')
  const takenTopLevel = new Set(items.filter((i) => i.kind === 'link').map((i) => i.target))
  const topLevelLinkOptions = [
    ...BUILT_IN_DESKTOP_LINK_TARGETS.filter((t) => !takenTopLevel.has(t)).map((t) => ({ id: t, label: BUILT_IN_LABELS[t] })),
    ...cardOptions.filter((c) => !takenTopLevel.has(c.id)),
  ]

  function update(id: string, patch: Partial<DesktopNavItem>) {
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }

  function remove(id: string) {
    onChange(items.filter((i) => i.id !== id))
  }

  function move(index: number, delta: number) {
    const next = [...items]
    const dest = index + delta
    if (dest < 0 || dest >= next.length) return
    ;[next[index], next[dest]] = [next[dest], next[index]]
    onChange(next)
  }

  function addLink(target: string) {
    if (!target) return
    onChange([...items, { id: newItemId(), label: targetLabel(target), kind: 'link', target }])
  }

  function addCategoriesMenu() {
    onChange([...items, { id: newItemId(), label: 'Categories', kind: 'categories-menu' }])
  }

  function addDropdown() {
    onChange([...items, { id: newItemId(), label: 'More', kind: 'more-menu', items: [] }])
  }

  function updateSubItems(parentId: string, subItems: DesktopNavItem[]) {
    update(parentId, { items: subItems })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
      <p className="text-[11px] text-muted">
        The header&rsquo;s top nav, desktop only. Rename any item; add a link straight to a category
        or page, or a dropdown that holds a few links of its own (like the default &ldquo;More&rdquo;
        menu). The Categories item is the one fixed built-in — it always opens the mega-menu set by
        Home page sections (Site tab), so it has no destination to pick.
      </p>

      {items.length === 0 && (
        <p className="text-xs text-red-600">The nav needs at least one item — add one below, or the header goes blank.</p>
      )}

      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={item.id} className="rounded-md border border-slate-200 p-2">
            <div className="flex items-start gap-2">
              <div className="flex flex-col gap-0.5 pt-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${item.label} earlier`}
                  className="text-xs leading-none text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-400 cursor-pointer disabled:cursor-default"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === items.length - 1}
                  aria-label={`Move ${item.label} later`}
                  className="text-xs leading-none text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-400 cursor-pointer disabled:cursor-default"
                >
                  ▼
                </button>
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-600 mb-1">Label</span>
                  <input
                    value={item.label}
                    onChange={(e) => update(item.id, { label: e.target.value })}
                    className={rowInputClass}
                  />
                </label>

                {item.kind === 'link' && (
                  <label className="block">
                    <span className="block text-[11px] font-medium text-slate-600 mb-1">Opens</span>
                    <select
                      value={item.target}
                      onChange={(e) => update(item.id, { target: e.target.value })}
                      className={rowInputClass}
                    >
                      <option value={item.target}>{targetLabel(item.target!)}</option>
                      {topLevelLinkOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {!isBuiltInDesktopLinkTarget(item.target!) && (
                      <span className="block text-[11px] text-muted mt-1">A link straight to this category.</span>
                    )}
                  </label>
                )}

                {item.kind === 'categories-menu' && (
                  <p className="text-[11px] text-muted">Opens the category mega-menu (Home page sections, Site tab).</p>
                )}

                {item.kind === 'more-menu' && (
                  <MoreMenuItems
                    items={item.items ?? []}
                    onChange={(subItems) => updateSubItems(item.id, subItems)}
                    targetLabel={targetLabel}
                    topLevelLinkOptions={topLevelLinkOptions}
                  />
                )}
              </div>

              <button
                type="button"
                onClick={() => remove(item.id)}
                className="shrink-0 text-xs text-muted hover:text-red-600 transition-colors cursor-pointer pt-1"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        {!hasCategoriesMenu && (
          <button
            type="button"
            onClick={addCategoriesMenu}
            className="text-xs font-medium border border-slate-300 rounded-full px-3 py-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            + Add “Categories” menu
          </button>
        )}
        <button
          type="button"
          onClick={addDropdown}
          className="text-xs font-medium border border-slate-300 rounded-full px-3 py-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer"
        >
          + Add a dropdown
        </button>
        {topLevelLinkOptions.length > 0 && (
          <label className="inline-flex items-center gap-1.5 text-xs">
            <span className="text-muted">+ Add a link:</span>
            <select
              value=""
              onChange={(e) => addLink(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Choose a destination…</option>
              {topLevelLinkOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  )
}

// The nested list inside a 'more-menu' item — same add/rename/reorder/remove
// shape as the top-level list above, minus the ability to add another
// dropdown or the Categories menu (a nested dropdown, or one mega-menu
// nested inside another, isn't a shape this header can render).
function MoreMenuItems({
  items,
  onChange,
  targetLabel,
  topLevelLinkOptions,
}: {
  items: DesktopNavItem[]
  onChange: (items: DesktopNavItem[]) => void
  targetLabel: (target: string) => string
  topLevelLinkOptions: { id: string; label: string }[]
}) {
  const taken = new Set(items.map((i) => i.target))
  const available = topLevelLinkOptions.filter((o) => !taken.has(o.id))

  function update(id: string, patch: Partial<DesktopNavItem>) {
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }
  function remove(id: string) {
    onChange(items.filter((i) => i.id !== id))
  }
  function move(index: number, delta: number) {
    const next = [...items]
    const dest = index + delta
    if (dest < 0 || dest >= next.length) return
    ;[next[index], next[dest]] = [next[dest], next[index]]
    onChange(next)
  }
  function add(target: string) {
    if (!target) return
    onChange([...items, { id: newItemId(), label: targetLabel(target), kind: 'link', target }])
  }

  return (
    <div className="mt-1 rounded-md bg-slate-50 p-2 space-y-2">
      <p className="text-[11px] font-medium text-slate-600">Dropdown contents</p>
      {items.length === 0 && <p className="text-[11px] text-muted">Empty — add a link below.</p>}
      <ul className="space-y-1.5">
        {items.map((sub, i) => (
          <li key={sub.id} className="flex items-center gap-1.5 rounded border border-slate-200 bg-white p-1.5">
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Move ${sub.label} earlier`}
                className="text-[10px] leading-none text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer disabled:cursor-default"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === items.length - 1}
                aria-label={`Move ${sub.label} later`}
                className="text-[10px] leading-none text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer disabled:cursor-default"
              >
                ▼
              </button>
            </div>
            <input
              value={sub.label}
              onChange={(e) => update(sub.id, { label: e.target.value })}
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <select
              value={sub.target}
              onChange={(e) => update(sub.id, { target: e.target.value })}
              className="shrink-0 rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value={sub.target}>{targetLabel(sub.target!)}</option>
              {available.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => remove(sub.id)}
              className="shrink-0 text-[11px] text-muted hover:text-red-600 cursor-pointer"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {available.length > 0 && (
        <select
          value=""
          onChange={(e) => add(e.target.value)}
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">+ Add a link…</option>
          {available.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
