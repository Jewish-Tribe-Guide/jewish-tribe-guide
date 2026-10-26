import { contactRows } from '@/lib/hospitalBoxes'
import type { ListedBox } from './watchJobTypes'
import { BoxRow, BoxRows } from './JobBoxes'

/** A box's people, under each list's own name when it has more than one
 *  ("Pantry", "Food packages"). */
export function People({ box, next }: { box: ListedBox; next?: Record<string, unknown> }) {
  const many = box.keys.length > 1
  return (
    <>
      {box.keys.map((k, i) => {
        const rows = contactRows(box.now[k], next && k in next ? next[k] : box.now[k])
        if (many && !rows.length) return null
        return (
          <div key={k}>
            {many && <h4 className="pb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-500">{box.labels[i]}</h4>}
            <BoxRows>
              {rows.length ? (
                rows.map((r, j) => (
                  <BoxRow
                    key={j}
                    name={r.name}
                    sub={r.sub || undefined}
                    // "was (845) 425-4070", as the drawing has it, not struck.
                    right={
                      <>
                        {r.right}
                        {r.was && <span className="block text-xs text-slate-500">was {r.was}</span>}
                      </>
                    }
                    mark={r.mark}
                    why={r.mark === 'gone' ? 'Not on Refuah' : undefined}
                  />
                ))
              ) : (
                <BoxRow name="None" />
              )}
            </BoxRows>
          </div>
        )
      })}
    </>
  )
}
