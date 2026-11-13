'use client'

import Link from 'next/link'

// ── A computer-home card that answers with one time (board G5b, Nov 11) ─────
// "Mincha 4:15 PM", "Candles 4:28 PM": a label, the time big, one quiet line,
// and a line glyph in a soft circle. The whole card is the one link, with no
// link text and no chevron: on a computer it lifts on hover instead (the
// user, Nov 11: "those two + kept up by the community can lose the chevrons
// and just have hover"). These cards are computer-only; the phone keeps its
// chevrons, having no hover to show it.

/** The outline every white card on the computer home carries all the time
 *  (board J1b, the user, Nov 11): a quiet grey line, so each card reads as
 *  its own box. It used to show only on hover, in blue. The photo tiles
 *  have none: the picture is their edge. */
export const HOME_CARD_OUTLINE = 'ring-1 ring-slate-300'
/** A home section's words and its button or form: stacked while its own
 *  box is under 920px, side by side from there. Needs an `@container`
 *  parent; reads the card's width, never the window's. */
export const NARROW_STACK = 'flex flex-col items-start @[920px]:flex-row @[920px]:items-center'

/** The lift every computer-home card without a chevron shares on hover:
 *  it rises, and its outline turns blue. */
export const LIFT_ON_HOVER =
  'transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.10)] hover:ring-[1.5px] hover:ring-primary'

export default function AnswerCard({
  href,
  icon,
  eyebrow,
  answer,
  detail,
  testId,
  prefetch,
  footer,
}: {
  href: string
  icon: React.ReactNode
  eyebrow: string
  /** The time, big. Null while it loads, when a bar stands in for it. */
  answer: string | null
  detail?: React.ReactNode
  testId: string
  prefetch?: false
  /** A strip along the card's bottom with a link of its own (the Shabbos
   *  card's eruv line, board L1). The card is then a box holding two links
   *  rather than one link, since a link can't sit inside another. */
  footer?: React.ReactNode
}) {
  // Sized by the card's own width (the user, Nov 12): under 448px, as two
  // cards side by side get in a narrow window, the glyph goes and the
  // answer drops to 30px, so "Shacharis 6:45 AM" stays on one line.
  const body = (
    <Link
      href={href}
      prefetch={prefetch}
      data-testid={testId}
      className={
        footer
          ? 'flex flex-1 items-center gap-5 px-7 pt-7 pb-6'
          : `flex w-full min-w-0 items-center gap-5 rounded-2xl bg-white px-7 py-7 ${HOME_CARD_OUTLINE} ${LIFT_ON_HOVER}`
      }
    >
      <span aria-hidden="true" className="hidden h-[60px] w-[60px] shrink-0 items-center @md:flex justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span data-testid={`${testId}-eyebrow`} className="block text-[12.5px] font-bold uppercase tracking-[0.12em] text-slate-500">{eyebrow}</span>
        {answer === null ? (
          <span aria-hidden="true" data-testid={`${testId}-loading`} className="mt-2 block h-9 w-1/2 animate-pulse rounded bg-slate-100" />
        ) : (
          <span data-testid={`${testId}-answer`} className="mt-1 block text-[30px] font-extrabold @md:text-[34px] leading-tight text-ink tabular-nums">{answer}</span>
        )}
        {detail && <span data-testid={`${testId}-detail`} className="mt-1 block text-[15px] text-slate-600">{detail}</span>}
      </span>
    </Link>
  )
  if (!footer) return <div className="@container flex">{body}</div>
  return (
    <div className="@container flex">
    <div data-testid={`${testId}-card`} className={`flex w-full min-w-0 flex-col overflow-hidden rounded-2xl bg-white ${HOME_CARD_OUTLINE} ${LIFT_ON_HOVER}`}>
      {body}
      {footer}
    </div>
    </div>
  )
}
