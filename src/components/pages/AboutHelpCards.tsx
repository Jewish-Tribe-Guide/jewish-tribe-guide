'use client'

import { useContributions } from '@/lib/communityContext'
import TellUsCard, { HELP_CARD, HelpCardBody } from './TellUsCard'

/** About's "Ways to help" (board About v2): tell us something, help run the
 *  guide, or start one where you live. The whole card is the link. The last
 *  two are an email to the address the page's own text gives, so they
 *  appear only when it gives one. */
export default function AboutHelpCards({ email }: { email: string | null }) {
  const contributions = useContributions()
  const mail = (subject: string) => `mailto:${email}?subject=${encodeURIComponent(subject)}`

  return (
    <section aria-labelledby="ways-to-help" className="flex flex-col gap-3 desktop:gap-4">
      <h2 id="ways-to-help" className="mx-1 mt-3 text-[1.25rem] font-extrabold tracking-tight text-slate-900 desktop:mx-0 desktop:mt-1 desktop:text-[1.5rem]">
        Ways to help
      </h2>
      {contributions.add && <TellUsCard />}
      {email && (
        <a className={HELP_CARD} href={mail('Helping run the guide')}>
          <HelpCardBody icon="check" title="Help run the guide" text="Email us to look after shuls, kosher food or another part of it." />
        </a>
      )}
      {email && (
        <a className={HELP_CARD} href={mail('A guide for my community')}>
          <HelpCardBody icon="map" title="Start a guide for your community" text="Email us. It’s the same guide, run by people where you live." />
        </a>
      )}
    </section>
  )
}
