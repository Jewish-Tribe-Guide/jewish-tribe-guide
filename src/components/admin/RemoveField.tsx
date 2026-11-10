'use client'

import { AdminBack, AdminBox } from './AdminUI'

// Board 16: a field's X, in the list, on one places have filled in opens this
// step first, saying what goes with it. With no answers, the field just goes.

export type Removing = {
  /** A field's key, or the page's address or phone. */
  target: { field: string } | 'address' | 'phone'
  label: string
  count: number
  /** It's part of the page's filter. */
  filter: boolean
}

export default function RemoveField({
  removing,
  page,
  onRemove,
  onKeep,
}: {
  removing: Removing
  /** The page's plural name, "Food". */
  page: string
  onRemove: () => void
  onKeep: () => void
}) {
  const { label, count } = removing
  const row = 'm-0 border-b border-slate-100 px-4 py-3.5 text-[15px] text-slate-900 last:border-b-0'
  return (
    <>
      <AdminBack back={{ label, onClick: onKeep }} title={`Remove ${label} from ${page}?`} />
      <AdminBox>
        <p className={row}>
          <b>
            {count} {count === 1 ? 'place' : 'places'}
          </b>{' '}
          {count === 1 ? 'loses its answer' : 'lose their answer'}
        </p>
        {removing.filter && <p className={row}>{`${page.endsWith('s') ? `${page}’` : `${page}’s`} filter loses ${label}`}</p>}
        {removing.target === 'address' && <p className={row}>{`${page} comes off the map`}</p>}
      </AdminBox>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRemove}
          className="min-h-11 px-4 rounded-lg bg-red-700 text-white text-[15px] font-bold hover:bg-red-800 cursor-pointer"
        >
          Remove it
        </button>
        <button
          type="button"
          onClick={onKeep}
          className="min-h-11 px-4 rounded-lg border border-slate-300 bg-white text-[15px] font-bold text-slate-900 hover:bg-slate-50 cursor-pointer"
        >
          Keep it
        </button>
      </div>
    </>
  )
}
