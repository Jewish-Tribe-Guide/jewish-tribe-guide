'use client'

import Link from 'next/link'

// ── A computer-home card that answers with one time (board G5b, Nov 11) ─────
// "Mincha 4:15 PM", "Candles 4:28 PM": a label, the time big, one quiet line,
// and a line glyph in a soft circle. The whole card is the one link, with no
// link text and no chevron: on a computer it lifts on hover instead (the
// user, Nov 11: "those two + kept up by the community can lose the chevrons
// and just have hover"). These cards are computer-only; the phone keeps its
// chevrons, having no hover to show it.

/** The lift every computer-home card without a chevron shares on hover. */
export const LIFT_ON_HOVER =
  'transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.10)] hover:ring-primary/35'

export default function AnswerCard({
  href,
  icon,
  eyebrow,
  answer,
  detail,
  testId,
  prefetch,
}: {
  href: string
  icon: React.ReactNode
  eyebrow: string
  /** The time, big. Null while it loads, when a bar stands in for it. */
  answer: string | null
  detail?: React.ReactNode
  testId: string
  prefetch?: false
}) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      data-testid={testId}
      className={`flex items-center gap-5 rounded-2xl bg-white px-7 py-7 ring-1 ring-slate-900/5 ${LIFT_ON_HOVER}`}
    >
      <span aria-hidden="true" className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span data-testid={`${testId}-eyebrow`} className="block text-[12.5px] font-bold uppercase tracking-[0.12em] text-slate-500">{eyebrow}</span>
        {answer === null ? (
          <span aria-hidden="true" data-testid={`${testId}-loading`} className="mt-2 block h-9 w-1/2 animate-pulse rounded bg-slate-100" />
        ) : (
          <span data-testid={`${testId}-answer`} className="mt-1 block text-[34px] font-extrabold leading-tight text-ink tabular-nums">{answer}</span>
        )}
        {detail && <span data-testid={`${testId}-detail`} className="mt-1 block text-[15px] text-slate-600">{detail}</span>}
      </span>
    </Link>
  )
}
