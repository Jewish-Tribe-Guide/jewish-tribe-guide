'use client'

import Link from 'next/link'
import { useCommunitySlug } from '@/lib/communityContext'
import { routes } from '@/lib/routes'
import { DEFAULT_FEEDBACK_BUTTON_LABEL } from '@/lib/siteSettings'

/** The computer footer's "Send a note": a link to the Feedback page. It
 *  opened a dialog over the page being read until Nov 16, when Feedback
 *  became one page on every screen (the user: "let's do full page"): the
 *  note never recorded which page it was written on, so the dialog's one
 *  advantage was the writer's memory, and two versions of one form drifted. */
export default function FeedbackButton({ buttonLabel = DEFAULT_FEEDBACK_BUTTON_LABEL }: { buttonLabel?: string }) {
  const communitySlug = useCommunitySlug()
  return (
    // -my-1 py-1: grows the tap target to the WCAG-recommended 24px minimum
    // (this text alone renders at ~21px) without shifting the footer row.
    <Link
      href={routes.feedback(communitySlug)}
      className="-my-1 inline-block py-1 text-sm text-slate-500 underline underline-offset-2 hover:text-slate-700"
    >
      {buttonLabel} &rarr;
    </Link>
  )
}
