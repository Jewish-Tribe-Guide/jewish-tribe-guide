'use client'

import { useState } from 'react'
import type { CategoryConfig } from '@/lib/categories'
import { MAX_WALK_LISTS, WALK_LIST_MINUTES, walkGroupFields, walkListFromKey, walkListKey, walkListTargets, type WalkList } from '@/lib/walkList'
import { AdminBox, AdminField, Chevron, adminInputClass } from './AdminUI'
import { addButton, RowActions } from './DragList'

// "Within a walk" (board 17): other pages' places near each of this page's,
// a row each ("Food · Up to 30 min · by Food Type"), opening in place to
// which page, how far and how they're grouped. On every listing with an
// address, nearest first, walked along the streets (walkList.ts).

export default function WalkBox({
  value,
  onChange,
  self,
  categories,
}: {
  value: string
  onChange: (key: string) => void
  self: Pick<CategoryConfig, 'id'>
  categories: readonly CategoryConfig[]
}) {
  const [open, setOpen] = useState<string | null>(null)
  const lists = walkListFromKey(value)
  const targets = walkListTargets(categories, self)
  if (targets.length === 0 && lists.length === 0) return null
  const put = (next: WalkList[]) => onChange(walkListKey(next))
  const unused = targets.filter((t) => !lists.some((l) => l.categoryId === t.id))

  return (
    <AdminBox
      title="Within a walk"
      foldOnPhone
      summary={lists.length ? lists.map((l) => categories.find((c) => c.id === l.categoryId)?.pluralLabel ?? l.categoryId).join(', ') : 'None'}
      action={
        unused.length > 0 &&
        lists.length < MAX_WALK_LISTS && (
          <button
            type="button"
            onClick={() => {
              put([...lists, { categoryId: unused[0].id, maxMinutes: 30 }])
              setOpen(unused[0].id)
            }}
            className={addButton}
          >
            + Add a page
          </button>
        )
      }
    >
      {lists.length === 0 && <p className="m-0 px-4 py-3 text-[15px] text-slate-600">None yet</p>}
      {lists.map((walk, i) => {
        const target = categories.find((c) => c.id === walk.categoryId)
        const groupFields = target ? walkGroupFields(target) : []
        const name = target?.pluralLabel ?? walk.categoryId
        const by = groupFields.find((f) => f.key === walk.groupBy)?.label
        const update = (patch: Partial<WalkList>) => put(lists.map((l, j) => (j === i ? { ...l, ...patch } : l)))
        const isOpen = open === walk.categoryId
        return (
          <div key={walk.categoryId} className="border-b border-slate-100 last:border-b-0">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : walk.categoryId)}
              className="flex min-h-[52px] w-full cursor-pointer items-center gap-2.5 px-4 py-2 text-left"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold text-slate-900">{name}</span>
                {!isOpen && (
                  <span className="text-[13px] text-slate-600">
                    Up to {walk.maxMinutes} min{by ? ` · by ${by}` : ''}
                  </span>
                )}
              </span>
              <span className={isOpen ? 'rotate-90' : ''}>
                <Chevron />
              </span>
            </button>
            {isOpen && (
              <div className="flex flex-col gap-3 px-4 pb-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <AdminField label="Which page">
                    <select
                      value={walk.categoryId}
                      onChange={(e) => {
                        update({ categoryId: e.target.value, groupBy: undefined })
                        setOpen(e.target.value)
                      }}
                      className={adminInputClass}
                    >
                      {!target && <option value={walk.categoryId}>{walk.categoryId}</option>}
                      {targets
                        .filter((t) => t.id === walk.categoryId || !lists.some((l) => l.categoryId === t.id))
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.pluralLabel}
                          </option>
                        ))}
                    </select>
                  </AdminField>
                  <AdminField label="How far">
                    <select value={walk.maxMinutes} onChange={(e) => update({ maxMinutes: Number(e.target.value) })} className={adminInputClass}>
                      {WALK_LIST_MINUTES.map((m) => (
                        <option key={m} value={m}>
                          Up to {m} min
                        </option>
                      ))}
                    </select>
                  </AdminField>
                  <AdminField label="Grouped by">
                    <select value={walk.groupBy ?? ''} onChange={(e) => update({ groupBy: e.target.value || undefined })} className={adminInputClass}>
                      <option value="">Distance</option>
                      {groupFields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </AdminField>
                </div>
                <RowActions name={name} onRemove={() => put(lists.filter((_, j) => j !== i))} />
              </div>
            )}
          </div>
        )
      })}
    </AdminBox>
  )
}
