'use client'

import { useState } from 'react'
import { PeopleIcon } from '@/components/icons'
import { ui } from '@/lib/uiConfig'
import ContributePicker from './ContributePicker'

/** One line under the home heading saying the guide is community-maintained.
 *
 *  Visitors who were shown the site read it as a static directory: the ways
 *  in to Add / Edit sat in a three-dot menu and, on desktop, a card near the
 *  bottom of the page (mobile had nothing at all). This is the plain-language
 *  version, on both. "Add a place" opens the same category picker the desktop
 *  "Submit a Listing" card does; "open any listing to suggest a correction"
 *  points at the link now shown under every listing's details.
 *
 *  Follows the community's own contribution switches (ui.contributions), so a
 *  curated directory that turned adding off doesn't invite it — and renders
 *  nothing at all when neither adding nor editing is on. `interactive` is off
 *  in the admin Site preview, where the link should look right but do nothing. */
export default function CommunityStrip({
  interactive = true,
  className = '',
}: {
  interactive?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const { add, edit } = ui.contributions
  if (!add && !edit) return null

  const link = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      disabled={!interactive}
      tabIndex={interactive ? 0 : -1}
      className="cursor-pointer font-semibold underline underline-offset-2 hover:text-amber-950 disabled:cursor-default"
    >
      Add a place
    </button>
  )

  return (
    <>
      <p
        className={`flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-left text-[13px] leading-snug text-amber-900 ${className}`}
      >
        <PeopleIcon className="mt-px h-4 w-4 shrink-0 text-amber-700" />
        <span>
          Community-maintained.{' '}
          {add && edit && <>{link}, or open any listing to suggest a correction.</>}
          {add && !edit && <>{link} we&rsquo;re missing.</>}
          {!add && edit && <>Open any listing to suggest a correction.</>}
        </span>
      </p>
      {open && <ContributePicker onClose={() => setOpen(false)} />}
    </>
  )
}
