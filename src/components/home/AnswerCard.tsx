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

/** The lift every computer-home card without a chevron shares on hover:
 *  it rises, and its outline turns blue. */
export const LIFT_ON_HOVER =
  'transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.10)] hover:ring-[1.5px] hover:ring-primary'
/** The same, for a picture inside a link that also holds its name (the
 *  computer's Explore tiles, board W2c, Nov 15): the pointer anywhere on
 *  the tile lifts the picture. Spelled out so Tailwind sees the classes;
 *  homeCardOutline.test keeps it LIFT_ON_HOVER's twin. */
export const LIFT_ON_GROUP_HOVER =
  'transition-[box-shadow,transform] duration-150 group-hover:-translate-y-0.5 group-hover:shadow-[0_10px_24px_rgba(15,23,42,0.10)] group-hover:ring-[1.5px] group-hover:ring-primary'

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
        <span data-testid={`${testId}-eyebrow`} className="block text-[0.78125rem] font-bold uppercase tracking-[0.12em] text-slate-500">{eyebrow}</span>
        {answer === null ? (
          <span aria-hidden="true" data-testid={`${testId}-loading`} className="mt-2 block h-9 w-1/2 animate-pulse rounded bg-slate-100" />
        ) : (
          <span data-testid={`${testId}-answer`} className="mt-1 block text-[1.875rem] font-extrabold @md:text-[2.125rem] leading-tight text-ink tabular-nums">{answer}</span>
        )}
        {detail && <span data-testid={`${testId}-detail`} className="mt-1 block text-[0.9375rem] text-slate-600">{detail}</span>}
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

/** The page's sign-off cards, Suggest a listing and Stay in the Loop (board
 *  W7l): white, outlined, words and their one control side by side once
 *  the card is 540px wide, stacked under that. Needs an `@container`
 *  parent; reads the card's width, never the window's. */
export const SIGN_OFF_CARD = 'flex h-full flex-col items-start gap-4 rounded-2xl bg-white px-7 py-6 @[540px]:flex-row @[540px]:items-center @[540px]:gap-5'
export const SIGN_OFF_EYEBROW = 'text-[0.71875rem] font-extrabold uppercase tracking-[0.08em] text-slate-500'
export const SIGN_OFF_HEADING = 'mt-1.5 text-[1.3125rem] font-extrabold leading-tight text-ink'
export const SIGN_OFF_LINE = 'mt-1 text-[0.90625rem] text-slate-600'
export const SIGN_OFF_BUTTON =
  'inline-flex h-10 shrink-0 cursor-pointer items-center rounded-full bg-primary px-[18px] text-[0.90625rem] font-bold text-white transition-colors hover:bg-primary-dark disabled:opacity-60'
