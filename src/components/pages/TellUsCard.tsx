'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import { GlyphDot, PageGlyph, type PageGlyphName } from './PageGlyph'

// Loaded on the first tap, as SiteAddButton does: nobody reading pays for it.
const TellUsSheet = dynamic(() => import('@/components/TellUsSheet'), { loading: () => null })

/** A whole-card link or button on About and Feedback (boards About v2 and
 *  Feedback, Nov 15). */
export const HELP_CARD =
  'flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md desktop:gap-[18px] desktop:px-[26px] desktop:py-6'

export function HelpCardBody({ icon, title, text }: { icon: PageGlyphName; title: string; text?: string }) {
  return (
    <>
      <GlyphDot name={icon} large />
      <span className="min-w-0 flex-1">
        <span className="block text-[16.5px] font-bold text-slate-900 desktop:text-[19px] desktop:font-extrabold">{title}</span>
        {text && <span className="mt-0.5 block text-[15px] leading-snug text-slate-600 desktop:text-[15.5px]">{text}</span>}
      </span>
      <PageGlyph name="chevron" className="h-5 w-5 flex-none text-slate-400" />
    </>
  )
}

/** "Know something we don't?": opens the same box as + Add, so a fix to a
 *  place arrives as something an admin can approve. The box is portaled to
 *  <body>: the Feedback dialog it can sit in has a transform (its opening
 *  animation) and the header's More menu a backdrop blur, and either would
 *  trap a fixed sheet inside it. `onOpenChange` lets that dialog step aside
 *  while the box is up. */
export default function TellUsCard({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false)
  // Kept mounted once opened so it slides away when closed (SiteAddButton).
  const [mounted, setMounted] = useState(false)
  if (open && !mounted) setMounted(true)
  const change = (next: boolean) => {
    setOpen(next)
    onOpenChange?.(next)
  }

  return (
    <>
      <button type="button" className={HELP_CARD} onClick={() => change(true)}>
        <HelpCardBody icon="plus" title="Know something we don’t?" text="Send a fix, a new place, or forward a message." />
      </button>
      {mounted && createPortal(<TellUsSheet isOpen={open} onClose={() => change(false)} />, document.body)}
    </>
  )
}
