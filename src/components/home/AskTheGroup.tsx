'use client'

import Link from 'next/link'

// The last thing a search that found nothing shows: where to ask, and how to
// put the answer in the guide once someone knows it. After whatever is close
// (see nearMiss), never instead of it — the people in the WhatsApp groups are
// who answer questions the guide can't yet, and the next person to ask
// shouldn't have to.
export default function AskTheGroup({
  query,
  nothingClose,
  askHref,
  addHref,
  className = '',
}: {
  query: string
  /** Nothing close was found either, so this is the whole answer: it says
   *  so, where otherwise the answer above it already has. */
  nothingClose: boolean
  /** The community's WhatsApp groups, when it has them. */
  askHref: string | null
  addHref: string
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white px-3.5 py-3 ${className}`} data-testid="ask-the-group">
      <p className="text-[14px] font-semibold leading-snug text-ink">
        {nothingClose ? `Nothing in the guide for “${query}” yet.` : 'Not what you’re looking for?'}
      </p>
      <ul className="mt-1.5 space-y-1 text-[13.5px]">
        {askHref && (
          <li>
            <Link href={askHref} className="font-semibold text-primary hover:text-primary-dark">
              Ask in a community WhatsApp group →
            </Link>
          </li>
        )}
        <li>
          <Link href={addHref} className="font-semibold text-primary hover:text-primary-dark">
            Know where to find it? Add it to the guide →
          </Link>
        </li>
      </ul>
    </div>
  )
}
