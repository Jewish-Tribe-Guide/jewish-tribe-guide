'use client'

import { useMemo, useState } from 'react'
import { BUILT_IN_DESKTOP_LINK_TARGETS, type DesktopNavItem } from '@/lib/siteSettings'
import { newDraftSectionId, type DraftHomeSection } from '@/lib/homeSections'
import { headingLine, headings, tabHolds, tabItems, tabLine, withTabItems } from '@/lib/navTabs'
import { LEFTOVER_SECTION } from '@/components/home/sections'
import { useCardOptions } from './useCardOptions'
import DragList, { AddMenu, InnerRow, OrderRow, addButton, type RowRename } from './DragList'

// ── The top of the page, on a computer, as tabs (the user, Nov 4; drawing
// KdHT8Tci1ufXSXobnnSfEm, boards "New · What goes in first decides" and
// "Tabs, links and headings"). A tab holds links or headings, and what goes
// in first decides which (lib/navTabs.ts): an empty tab offers both, a tab
// with a link offers only links, a tab with a heading only headings.
//
// Categories is the tab whose headings are the home sections — the groups,
// which only ever showed as this menu's columns, so they're edited here now
// rather than on the Home page. Its last row is Other, where any category in
// no heading lands; Other has no handle and no trash can, since it isn't a
// heading anyone made.
//
// Reuses useCardOptions — the same list the featured-card picker and the
// mobile tab bar draw from — so a link can point anywhere those can, and a
// newly added category shows up here without touching this file. ──────────

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

/** A new link's name, as the site's own header calls it. Links aren't
 *  renamed here, so it has to read right on the site. */
const LINK_NAMES: Record<string, string> = { map: 'Map', you: 'You', about: 'About', privacy: 'Privacy', feedback: 'Feedback' }

/** What a row says its link opens, as the site's own screens are called. */
const OPENS: Record<string, string> = {
  map: 'the Map',
  you: 'You',
  about: 'the About page',
  privacy: 'the Privacy page',
  feedback: 'the Feedback form',
}

type Option = { id: string; label: string }

export default function DesktopNavEditor({
  items,
  onChange,
  sections = [],
  onSectionsChange = () => {},
}: {
  items: DesktopNavItem[]
  onChange: (items: DesktopNavItem[]) => void
  /** Every home_section row: the plain ones are Categories' headings. */
  sections?: DraftHomeSection[]
  onSectionsChange?: (sections: DraftHomeSection[]) => void
}) {
  const cardOptions = useCardOptions()
  const targetLabel = useMemo(() => {
    const byId = new Map(cardOptions.map((c) => [c.id, c.label]))
    return (target: string) => BUILT_IN_LABELS[target] ?? byId.get(target) ?? target
  }, [cardOptions])
  const opens = (target: string) => `Opens ${OPENS[target] ?? targetLabel(target)}`
  const linkName = (target: string) => LINK_NAMES[target] ?? targetLabel(target)
  const allTargets: Option[] = [...BUILT_IN_DESKTOP_LINK_TARGETS.map((t) => ({ id: t, label: BUILT_IN_LABELS[t]! })), ...cardOptions]
  const [openId, setOpenId] = useState<string | null>(null)
  // Just added: its name is selected, ready to type over.
  const [fresh, setFresh] = useState<string | null>(null)
  const toggle = (id: string) => setOpenId(openId === id ? null : id)

  const hasCategoriesMenu = items.some((i) => i.kind === 'categories-menu')
  const headingCount = sections.filter((s) => s.kind === 'section').length

  function update(id: string, next: DesktopNavItem) {
    onChange(items.map((i) => (i.id === id ? next : i)))
  }

  function remove(id: string) {
    setOpenId(null)
    onChange(items.filter((i) => i.id !== id))
  }

  function add(item: Omit<DesktopNavItem, 'id'>) {
    const id = newItemId()
    onChange([...items, { id, ...item }])
    setOpenId(id)
    setFresh(id)
  }

  const rename = (item: DesktopNavItem): RowRename => ({
    value: item.label,
    fresh: fresh === item.id,
    onChange: (label) => update(item.id, { ...item, label }),
  })

  return (
    <div>
      {items.length === 0 && (
        <p className="m-0 px-4 pt-3 text-xs text-red-600">The nav needs at least one item — add one below, or the header goes blank.</p>
      )}

      <DragList items={items} keyOf={(i) => i.id} nameOf={(i) => i.label} onReorder={onChange}>
        {(item, row) => (
          <OrderRow
            row={row}
            name={item.label || 'Untitled'}
            line={item.kind === 'categories-menu' ? `Dropdown · ${headings(headingCount)}` : tabLine(item, opens)}
            open={openId === item.id}
            onToggle={() => toggle(item.id)}
            rename={rename(item)}
            onRemove={() => remove(item.id)}
          >
            {item.kind === 'categories-menu' ? (
              <CategoriesHeadings sections={sections} onChange={onSectionsChange} cardOptions={cardOptions} />
            ) : (
              <TabContents
                tab={item}
                onChange={(next) => update(item.id, next)}
                allTargets={allTargets}
                linkName={linkName}
                opens={opens}
              />
            )}
          </OrderRow>
        )}
      </DragList>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
        <button type="button" onClick={() => add({ label: 'New tab', kind: 'more-menu', items: [] })} className={addButton}>
          + Add a tab
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

/** An open tab: its links or headings, and what can go in next. */
function TabContents({
  tab,
  onChange,
  allTargets,
  linkName,
  opens,
}: {
  tab: DesktopNavItem
  onChange: (tab: DesktopNavItem) => void
  allTargets: Option[]
  linkName: (target: string) => string
  opens: (target: string) => string
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const holds = tabHolds(tab)
  const inside = tabItems(tab)
  const set = (next: DesktopNavItem[]) => onChange(withTabItems(tab, next))

  function addLink(target: string) {
    set([...inside, { id: newItemId(), label: linkName(target), kind: 'link', target }])
  }
  function addHeading() {
    const id = newItemId()
    set([...inside, { id, label: 'New heading', kind: 'heading', items: [] }])
    setOpenId(id)
    setFresh(id)
  }

  const linkAdd = <AddMenu label="+ Add a link" options={allTargets.filter((o) => !inside.some((i) => i.target === o.id))} onPick={addLink} />
  const headingAdd = (
    <button type="button" onClick={addHeading} className={addButton}>
      + Add a heading
    </button>
  )

  return (
    <>
      {holds === 'links' && <Links links={inside} onChange={set} linkName={linkName} opens={opens} />}
      {holds === 'headings' && (
        <DragList items={inside} keyOf={(h) => h.id} nameOf={(h) => h.label} onReorder={set} className="rounded-lg border border-slate-200">
          {(h, row) => {
            const links = h.items ?? []
            const put = (next: DesktopNavItem) => set(inside.map((i) => (i.id === h.id ? next : i)))
            return (
              <OrderRow
                row={row}
                name={h.label || 'Untitled'}
                line={headingLine(links.map((l) => l.label))}
                open={openId === h.id}
                onToggle={() => setOpenId(openId === h.id ? null : h.id)}
                rename={{ value: h.label, fresh: fresh === h.id, onChange: (label) => put({ ...h, label }) }}
                onRemove={() => set(inside.filter((i) => i.id !== h.id))}
              >
                {links.length > 0 && (
                  <Links links={links} onChange={(next) => put({ ...h, items: next })} linkName={linkName} opens={opens} />
                )}
                <div className="flex flex-wrap items-center gap-2.5">
                  <AddMenu
                    label="+ Add a link"
                    options={allTargets.filter((o) => !links.some((l) => l.target === o.id))}
                    onPick={(target) => put({ ...h, items: [...links, { id: newItemId(), label: linkName(target), kind: 'link', target }] })}
                  />
                </div>
              </OrderRow>
            )
          }}
        </DragList>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        {holds !== 'headings' && linkAdd}
        {holds !== 'links' && headingAdd}
      </div>
    </>
  )
}

/** A tab's or a heading's links, each a name and an ×. A link added here is
 *  named after where it goes, so only an older one named otherwise says
 *  where (the user, Nov 4: "How many times are we going to say opens map"). */
function Links({
  links,
  onChange,
  linkName,
  opens,
}: {
  links: DesktopNavItem[]
  onChange: (links: DesktopNavItem[]) => void
  linkName: (target: string) => string
  opens: (target: string) => string
}) {
  return (
    <DragList items={links} keyOf={(l) => l.id} nameOf={(l) => l.label} onReorder={onChange} className="rounded-lg border border-slate-200">
      {(link, row) => (
        <InnerRow
          row={row}
          name={link.label || 'Untitled'}
          line={link.label === linkName(link.target!) ? undefined : opens(link.target!)}
          onRemove={() => onChange(links.filter((l) => l.id !== link.id))}
        />
      )}
    </DragList>
  )
}

/** Categories' headings: the home sections, each over its categories, then
 *  Other. A category is in one heading at most; picking one from another
 *  heading moves it. Taking a heading off asks once, and its links move to
 *  Other. */
function CategoriesHeadings({
  sections,
  onChange,
  cardOptions,
}: {
  sections: DraftHomeSection[]
  onChange: (sections: DraftHomeSection[]) => void
  cardOptions: Option[]
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const labelById = useMemo(() => new Map(cardOptions.map((c) => [c.id, c.label])), [cardOptions])
  const cardName = (id: string) => labelById.get(id) ?? id

  const sectionEntries = sections.filter((s) => s.kind === 'section')
  // The home page's built-in blocks share the table; left exactly as they are.
  const builtInEntries = sections.filter((s) => s.kind !== 'section')
  const assigned = new Set(sectionEntries.flatMap((s) => s.cardIds))
  const other = cardOptions.filter((c) => !assigned.has(c.id))

  const put = (id: string, patch: Partial<DraftHomeSection>) => onChange(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  function addHeading() {
    const id = newDraftSectionId()
    onChange([...sectionEntries, { id, kind: 'section', title: 'New heading', cardIds: [], width: 'full' }, ...builtInEntries])
    setOpenId(id)
    setFresh(id)
  }

  // Pulled out of whatever heading it was in: a category is in one at most.
  function addCard(sectionId: string, cardId: string) {
    onChange(
      sections.map((s) => {
        if (s.id === sectionId) return { ...s, cardIds: [...s.cardIds, cardId] }
        if (s.cardIds.includes(cardId)) return { ...s, cardIds: s.cardIds.filter((id) => id !== cardId) }
        return s
      }),
    )
  }

  function removeHeading(id: string) {
    setRemoving(null)
    setOpenId(null)
    onChange(sections.filter((s) => s.id !== id))
  }

  const quiet = 'min-h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer'

  return (
    <>
      <div className="rounded-lg border border-slate-200">
        <DragList items={sectionEntries} keyOf={(s) => s.id} nameOf={(s) => s.title} onReorder={(next) => onChange([...next, ...builtInEntries])}>
          {(s, row) => {
            const open = openId === s.id
            const availableHere = cardOptions
              .filter((c) => !s.cardIds.includes(c.id))
              .map((c) => ({ id: c.id, label: assigned.has(c.id) ? `${c.label} (move here)` : c.label }))
            return (
              <OrderRow
                row={row}
                name={s.title || 'Untitled'}
                line={headingLine(s.cardIds.map(cardName))}
                open={open}
                onToggle={() => setOpenId(open ? null : s.id)}
                rename={{ value: s.title, fresh: fresh === s.id, onChange: (title) => put(s.id, { title }) }}
                onRemove={() => setRemoving(s.id)}
              >
                {s.cardIds.length > 0 && (
                  <DragList
                    items={s.cardIds}
                    keyOf={(id) => id}
                    nameOf={cardName}
                    onReorder={(cardIds) => put(s.id, { cardIds })}
                    className="rounded-lg border border-slate-200"
                  >
                    {(cardId, inner) => (
                      <InnerRow row={inner} name={cardName(cardId)} onRemove={() => put(s.id, { cardIds: s.cardIds.filter((id) => id !== cardId) })} />
                    )}
                  </DragList>
                )}
                {removing === s.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="m-0 flex-1 text-sm font-semibold text-slate-900">
                      Take {s.title || 'this heading'} off? Its links move to {LEFTOVER_SECTION}.
                    </p>
                    <button type="button" onClick={() => removeHeading(s.id)} className="min-h-10 px-3 rounded-lg bg-red-600 text-white text-sm font-semibold cursor-pointer">
                      Take it off
                    </button>
                    <button type="button" onClick={() => setRemoving(null)} className={quiet}>
                      Leave it
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <AddMenu label="+ Add a link" options={availableHere} onPick={(id) => addCard(s.id, id)} />
                  </div>
                )}
              </OrderRow>
            )
          }}
        </DragList>
        <OtherRow names={other.map((c) => c.label)} />
      </div>
      <div>
        <button type="button" onClick={addHeading} className={addButton}>
          + Add a heading
        </button>
      </div>
    </>
  )
}

/** Other, last: what's in no heading. No handle and no trash can; it opens
 *  to its links. */
function OtherRow({ names }: { names: string[] }) {
  const [open, setOpen] = useState(false)
  const line = names.length ? `${names.join(' · ')} · new categories land here` : 'New categories land here'
  return (
    <OrderRow row={{ handle: <span className="w-8 shrink-0" aria-hidden />, rowProps: { onPointerDown: () => {}, onContextMenu: () => {} }, lifted: false }} name={LEFTOVER_SECTION} line={line} open={open} onToggle={() => setOpen(!open)}>
      {names.length > 0 && (
        <ul className="m-0 flex list-none flex-col rounded-lg border border-slate-200 p-0">
          {names.map((n) => (
            <li key={n} className="border-b border-slate-100 px-3 py-2.5 text-[15px] font-medium text-slate-900 last:border-b-0">
              {n}
            </li>
          ))}
        </ul>
      )}
    </OrderRow>
  )
}
