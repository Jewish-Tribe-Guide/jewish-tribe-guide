'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { ui } from '@/lib/uiConfig'
import { GlyphDot, PageGlyph, type PageGlyphName } from './PageGlyph'

// Loaded on the first tap, as SiteAddButton does: nobody reading pays for it.
const TellUsSheet = dynamic(() => import('@/components/TellUsSheet'), { loading: () => null })

const CARD =
  'flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md desktop:gap-[18px] desktop:px-[26px] desktop:py-6'

function CardBody({ icon, title, text }: { icon: PageGlyphName; title: string; text: string }) {
  return (
    <>
      <GlyphDot name={icon} large />
      <span className="min-w-0 flex-1">
        <span className="block text-[16.5px] font-bold text-slate-900 desktop:text-[19px] desktop:font-extrabold">{title}</span>
        <span className="mt-0.5 block text-[15px] leading-snug text-slate-600 desktop:text-[15.5px]">{text}</span>
      </span>
      <PageGlyph name="chevron" className="h-5 w-5 flex-none text-slate-400" />
    </>
  )
}

/** About's "Ways to help" (board About v2): tell us something, help run the
 *  guide, or start one where you live. The whole card is the link. The last
 *  two are an email to the address the page's own text gives, so they
 *  appear only when it gives one. */
export default function AboutHelpCards({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false)
  // Kept mounted once opened so it slides away when closed (SiteAddButton).
  const [mounted, setMounted] = useState(false)
  if (open && !mounted) setMounted(true)
  const mail = (subject: string) => `mailto:${email}?subject=${encodeURIComponent(subject)}`

  return (
    <section aria-labelledby="ways-to-help" className="flex flex-col gap-3 desktop:gap-4">
      <h2 id="ways-to-help" className="mx-1 mt-3 text-[20px] font-extrabold tracking-tight text-slate-900 desktop:mx-0 desktop:mt-1 desktop:text-[24px]">
        Ways to help
      </h2>
      {ui.contributions.add && (
        <button type="button" className={CARD} onClick={() => setOpen(true)}>
          <CardBody icon="plus" title="Know something we don’t?" text="Send a fix, a new place, or forward a message." />
        </button>
      )}
      {email && (
        <a className={CARD} href={mail('Helping run the guide')}>
          <CardBody icon="check" title="Help run the guide" text="Email us to look after shuls, kosher food or another part of it." />
        </a>
      )}
      {email && (
        <a className={CARD} href={mail('A guide for my community')}>
          <CardBody icon="map" title="Start a guide for your community" text="Email us. It’s the same guide, run by people where you live." />
        </a>
      )}
      {mounted && <TellUsSheet isOpen={open} onClose={() => setOpen(false)} />}
    </section>
  )
}
