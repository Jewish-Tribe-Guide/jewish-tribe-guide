import Link from 'next/link'

// The console's one look for boxes, rows and empty screens (the admin
// redesign's step 1): white boxes with a quiet border, one row style with a
// name, one line under it and a chevron, and empty screens that say so in a
// box of the same shape.

export function AdminBox({
  title,
  count,
  children,
}: {
  title?: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <section aria-label={title} className="bg-white border border-slate-200 rounded-[10px]">
      {title && (
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-slate-100">
          <h2 className="flex-1 m-0 text-base font-bold text-slate-900">{title}</h2>
          {count !== undefined && <AdminCount n={count} />}
        </div>
      )}
      {children}
    </section>
  )
}

export function AdminCount({ n }: { n: number }) {
  return (
    <span className="text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2 py-px">
      {n}
    </span>
  )
}

export function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#94a3b8" strokeWidth="1.8" aria-hidden="true" className="shrink-0">
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

/** One row: a name, at most one line under it, something short on the
 *  right, and a chevron. The whole row is the link. */
export function AdminRow({
  href,
  name,
  line,
  aside,
}: {
  href: string
  name: React.ReactNode
  line?: React.ReactNode
  aside?: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-2.5 min-h-[52px] border-b border-slate-100 last:border-b-0 text-slate-900 hover:bg-slate-50"
    >
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{name}</span>
        {line && <span className="text-[13px] text-slate-600">{line}</span>}
      </span>
      {aside && <span className="text-[13px] text-slate-600">{aside}</span>}
      <Chevron />
    </Link>
  )
}

/** An empty screen or list: one short line, in the same box as everything
 *  else. To do's lists say "Nothing to do." */
export function AdminEmpty({ children = 'Nothing to do.' }: { children?: React.ReactNode }) {
  return (
    <p className="bg-white border border-slate-200 rounded-[10px] px-4 py-6 text-center text-[15px] text-slate-600">
      {children}
    </p>
  )
}
