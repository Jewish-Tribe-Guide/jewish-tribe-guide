'use client'

import { useMemo, useState } from 'react'
import { BUILT_IN_DESKTOP_LINK_TARGETS, type DesktopNavItem } from '@/lib/siteSettings'
import { useCardOptions } from './HomeSectionManager'
import DragList, { AddMenu, InnerRow, OrderRow, addButton, rowButton } from './DragList'

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
  you: 'You (saved places and searches)',
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

/** What a row says its link opens, as the site's own screens are called. */
const OPENS: Record<string, string> = {
  map: 'the Map',
  you: 'You',
  about: 'the About page',
  privacy: 'the Privacy page',
  feedback: 'the Feedback form',
}

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

const fieldLabel = 'block text-[13px] font-semibold text-slate-700 mb-1'

export default function DesktopNavEditor({
  items,
  onChange,
}: {
  items: DesktopNavItem[]
  onChange: (items: DesktopNavItem[]) => void
}) {
  const cardOptions = useCardOptions()
  const targetLabel = useMemo(() => targetLabelFn(cardOptions), [cardOptions])
  const opens = (target: string) => `Opens ${OPENS[target] ?? targetLabel(target)}`
  // Each link one row saying where it goes; a dropdown opens to its own
  // links, in the same rows (note 27).
  const [openId, setOpenId] = useState<string | null>(null)
  const toggle = (id: string) => setOpenId(openId === id ? null : id)

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
    setOpenId(null)
    onChange(items.filter((i) => i.id !== id))
  }

  function add(item: Omit<DesktopNavItem, 'id'>) {
    const id = newItemId()
    onChange([...items, { id, ...item }])
    setOpenId(id)
  }

  function line(item: DesktopNavItem) {
    if (item.kind === 'categories-menu') return 'Menu of the Browse groups'
    if (item.kind === 'link') return opens(item.target!)
    const subs = item.items ?? []
    return `Dropdown · ${subs.length ? subs.map((s) => s.label).join(', ') : 'nothing in it yet'}`
  }

  return (
    <div>
      {items.length === 0 && (
        <p className="m-0 px-4 pt-3 text-xs text-red-600">The nav needs at least one item — add one below, or the header goes blank.</p>
      )}

      <DragList items={items} keyOf={(i) => i.id} nameOf={(i) => i.label} onReorder={onChange}>
        {(item, row) => (
          <OrderRow row={row} name={item.label || 'Untitled'} line={line(item)} open={openId === item.id} onToggle={() => toggle(item.id)}>
            <label className="block">
              <span className={fieldLabel}>Name</span>
              <input value={item.label} onChange={(e) => update(item.id, { label: e.target.value })} className={inputClass} />
            </label>
            {item.kind === 'link' && (
              <OpensField value={item.target!} options={topLevelLinkOptions} targetLabel={targetLabel} onChange={(target) => update(item.id, { target })} />
            )}
            {item.kind === 'more-menu' ? (
              <MoreMenuItems
                items={item.items ?? []}
                onChange={(subItems) => update(item.id, { items: subItems })}
                targetLabel={targetLabel}
                opens={opens}
                topLevelLinkOptions={topLevelLinkOptions}
                onRemoveMenu={() => remove(item.id)}
              />
            ) : (
              <div>
                <button type="button" onClick={() => remove(item.id)} className={rowButton}>
                  Take it off
                </button>
              </div>
            )}
          </OrderRow>
        )}
      </DragList>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
        <AddMenu label="+ Add a link" options={topLevelLinkOptions} onPick={(target) => add({ label: targetLabel(target), kind: 'link', target })} />
        <button type="button" onClick={() => add({ label: 'More', kind: 'more-menu', items: [] })} className={addButton}>
          + Add a dropdown
        </button>
        {!hasCategoriesMenu && (
          <button type="button" onClick={() => add({ label: 'Categories', kind: 'categories-menu' })} className={addButton}>
            + Add the Categories menu
          </button>
        )}
      </div>
    </div>
  )
}

function OpensField({
  value,
  options,
  targetLabel,
  onChange,
}: {
  value: string
  options: { id: string; label: string }[]
  targetLabel: (target: string) => string
  onChange: (target: string) => void
}) {
  return (
    <label className="block">
      <span className={fieldLabel}>Opens</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {/* The current target stays selectable, though this very row has it. */}
        <option value={value}>{targetLabel(value)}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

// The links inside a 'more-menu' item, in the same rows — minus adding
// another dropdown or the Categories menu (a nested dropdown, or one
// mega-menu nested inside another, isn't a shape this header can render).
// A link's name opens it to rename it or change where it goes.
function MoreMenuItems({
  items,
  onChange,
  targetLabel,
  opens,
  topLevelLinkOptions,
  onRemoveMenu,
}: {
  items: DesktopNavItem[]
  onChange: (items: DesktopNavItem[]) => void
  targetLabel: (target: string) => string
  opens: (target: string) => string
  topLevelLinkOptions: { id: string; label: string }[]
  onRemoveMenu: () => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const taken = new Set(items.map((i) => i.target))
  const available = topLevelLinkOptions.filter((o) => !taken.has(o.id))

  function update(id: string, patch: Partial<DesktopNavItem>) {
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }
  function add(target: string) {
    const id = newItemId()
    onChange([...items, { id, label: targetLabel(target), kind: 'link', target }])
    setOpenId(id)
  }

  return (
    <>
      {items.length > 0 && (
        <DragList items={items} keyOf={(i) => i.id} nameOf={(i) => i.label} onReorder={onChange} className="rounded-lg border border-slate-200">
          {(sub, row) => (
            <InnerRow
              row={row}
              name={sub.label || 'Untitled'}
              aside={opens(sub.target!)}
              onRemove={() => onChange(items.filter((i) => i.id !== sub.id))}
              open={openId === sub.id}
              onToggle={() => setOpenId(openId === sub.id ? null : sub.id)}
            >
              <label className="block">
                <span className={fieldLabel}>Name</span>
                <input value={sub.label} onChange={(e) => update(sub.id, { label: e.target.value })} className={inputClass} />
              </label>
              <OpensField value={sub.target!} options={available} targetLabel={targetLabel} onChange={(target) => update(sub.id, { target })} />
            </InnerRow>
          )}
        </DragList>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <AddMenu label="+ Add a link" options={available} onPick={add} />
        <button type="button" onClick={onRemoveMenu} className={rowButton}>
          Take it off
        </button>
      </div>
    </>
  )
}
