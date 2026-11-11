import { createContext, useContext, type ReactNode } from 'react'
import { community } from '@/community.config'
import { PencilIcon } from '@/components/icons'

// Small pieces an opened listing's sections share (ListingView, DaveningCard).

/** A box drawn inside another (the davening times, the items, Delivery,
 *  put in one of the admin's boxes): the box around it says its name.
 *  Null outside one. */
const InBox = createContext<{ title: string } | null>(null)
export const InBoxProvider = InBox.Provider

/** A title that only says the box's name again, a count aside ("Main
 *  dishes · 10" in "Main dishes"). */
const sameName = (title: string, box: string) => title.replace(/ · \d+$/, '').trim().toLowerCase() === box.trim().toLowerCase()

/** One of an opened listing's boxes (Oct 6): white on the listing's grey,
 *  a title when what's in it needs naming ("Main dishes", "Women’s"), none
 *  when its icons or its words say what it is (the contact box, the
 *  description), and a dated line under it when it has one. */
export function Card({
  title,
  children,
  footer,
  testId,
  action,
  onEdit,
  muted,
}: {
  title?: string
  children: ReactNode
  footer?: ReactNode
  testId?: string
  action?: ReactNode
  /** Edit, at the end of the box's last line: that box alone, in its own
   *  editor (the user, Oct 15: the same word, in the same place, under
   *  every box). A box whose footer is a FreshnessFooter gives it the Edit
   *  instead, beside its date. */
  onEdit?: () => void
  /** Times that don't apply right now, opened anyway (a shul's usual times
   *  under this week's schedule): a grey, dashed box (plain grey matched the
   *  listing sheet behind it and read as no box at all), faded but readable, its first
   *  child (the line saying why) and its footer at full strength (the user,
   *  Oct 19). */
  muted?: boolean
}) {
  const [why, ...rest] = Array.isArray(children) ? children : [children]
  const inBox = useContext(InBox)
  if (inBox) {
    // Inside another box: no frame of its own, and its name small, as the
    // box's other fields are, unless it only says the box's name again
    // (the user, Nov 10: "Main dishes" three times).
    const named = title && !sameName(title, inBox.title) ? title : null
    return (
      <div className="py-1" data-testid={testId} data-muted={muted || undefined}>
        {(named || action) && (
          <div className="flex items-baseline justify-between gap-3 pt-1.5">
            {named ? <p className="text-[12px] font-extrabold uppercase tracking-wide text-muted">{named}</p> : <span />}
            {action}
          </div>
        )}
        {muted ? (
          <>
            {why}
            <div className="opacity-50">{rest}</div>
          </>
        ) : (
          children
        )}
        {(footer || onEdit) && (
          <div className="mt-1.5 flex items-center gap-2 pt-1 text-[13px] leading-snug text-muted">
            <div className="min-w-0 flex-1">{footer}</div>
            {onEdit && <EditButton onClick={onEdit} />}
          </div>
        )}
      </div>
    )
  }
  return (
    <section
      className={`rounded-2xl border px-4 pb-3 ${muted ? 'border-dashed border-slate-300 bg-slate-200/50' : 'border-slate-200 bg-white'} ${title ? 'pt-3.5' : 'pt-1'}`}
      data-testid={testId}
      data-muted={muted || undefined}
    >
      {title &&
        (action ? (
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className="text-base font-extrabold text-slate-900">{title}</h2>
            {action}
          </div>
        ) : (
          <h2 className="mb-1 text-base font-extrabold text-slate-900">{title}</h2>
        ))}
      {muted ? (
        <>
          {why}
          <div className="opacity-50">{rest}</div>
        </>
      ) : (
        children
      )}
      {(footer || onEdit) && (
        <div className={`mt-2.5 flex items-center gap-2 border-t pt-2 text-[13px] leading-snug text-muted ${muted ? 'border-slate-300' : 'border-slate-100'}`}>
          <div className="min-w-0 flex-1">{footer}</div>
          {onEdit && <EditButton onClick={onEdit} />}
        </div>
      )}
    </section>
  )
}

/** "✎ Edit": under every box of an opened listing, the one way to change
 *  what it says. */
export function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 text-[14.5px] font-bold text-primary hover:underline"
      data-testid="box-edit-button"
    >
      <PencilIcon className="h-3.5 w-3.5" />
      Edit
    </button>
  )
}

/** "Sep 30", in the community's own timezone, so the server and the
 *  browser always agree (a date near midnight read in two timezones is two
 *  dates, and a mismatch React redoes the page for). With the year once it's
 *  most of a year ago, which needs the visitor's clock: `now`, from useNow,
 *  null until the page has hydrated. */
export function shortDate(iso: string, now: number | null = null): string {
  const d = new Date(iso)
  const old = now !== null && now - d.getTime() > 300 * 86_400_000
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(old ? { year: 'numeric' } : {}), timeZone: community.timezone })
}
