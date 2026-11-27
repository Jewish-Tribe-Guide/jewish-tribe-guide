'use client'

import { useContributions } from '@/lib/communityContext'
import { PAGE_BOX } from '@/lib/pageColumn'
import TellUsCard, { HELP_ROW, HelpCardBody } from './TellUsCard'

/** About's "Ways to help": tell us something, help run the guide, or start
 *  one where you live, as rows in one box (Nov 26, About laid out as
 *  Privacy). The whole row is the link. The last two are an email to the
 *  address the page's own text gives, so they appear only when it gives
 *  one. */
export default function AboutHelpCards({ email }: { email: string | null }) {
  const contributions = useContributions()
  const mail = (subject: string) => `mailto:${email}?subject=${encodeURIComponent(subject)}`

  return (
    <section id="ways-to-help" aria-labelledby="ways-to-help-h" className={`${PAGE_BOX} overflow-hidden desktop:scroll-mt-24`}>
      <h2 id="ways-to-help-h" className="px-4 pb-1 pt-[18px] text-[1.1875rem] font-bold text-slate-900 desktop:px-9 desktop:pt-[30px]">
        Ways to help
      </h2>
      <div className="divide-y divide-slate-200">
        {contributions.add && <TellUsCard className={HELP_ROW} />}
        {email && (
          <a className={HELP_ROW} href={mail('Helping run the guide')}>
            <HelpCardBody icon="check" title="Help run the guide" text="Email us to look after shuls, kosher food or another part of it." />
          </a>
        )}
        {email && (
          <a className={HELP_ROW} href={mail('A guide for my community')}>
            <HelpCardBody icon="map" title="Start a guide for your community" text="Email us. It’s the same guide, run by people where you live." />
          </a>
        )}
      </div>
    </section>
  )
}
