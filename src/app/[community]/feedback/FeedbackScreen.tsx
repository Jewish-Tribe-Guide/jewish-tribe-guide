'use client'

import { useState } from 'react'
import FeedbackForm from '@/components/FeedbackForm'
import PhotoHeader from '@/components/PhotoHeader'
import TellUsCard, { HELP_CARD } from '@/components/pages/TellUsCard'
import { GlyphDot } from '@/components/pages/PageGlyph'
import { useSiteSettings } from '@/lib/useSiteSettings'
import { useIsMobile } from '@/lib/useIsMobile'
import { useSiteNavigation } from '@/lib/useSiteNavigation'
import { useSetScreenHeader, useSetTabHeader } from '@/lib/headerVisibility'
import { PAGE_COLUMN } from '@/lib/pageColumn'
import { DEFAULT_MOBILE_TABS } from '@/lib/siteSettings'
import { TAB_BAR_CLEARANCE } from '@/lib/tabBarClearance'
import { useContributions } from '@/lib/communityContext'

const EYEBROW = 'mx-0.5 text-[13px] font-bold uppercase tracking-[0.06em] text-slate-500'

// Feedback as a page (board Feedback, Nov 15): About and Privacy's look. On a
// phone, "Know something we don't?" first, so a fix to a place goes into the
// + Add box where an admin can approve it, then the note. On a computer, the
// photo header, the note on the left, and on the right that card and the
// email address the About page gives.
//
// On a computer the footer's "Send a note" and the header's Feedback link
// here. They opened a dialog over the page instead until Nov 16, when the
// user chose one page everywhere ("let's do full page").
//
// Split out of page.tsx (a thin server wrapper exporting generateMetadata,
// which a 'use client' file can't) so the page can have its own canonical tag.
export default function FeedbackScreen({ email = null }: { email?: string | null }) {
  const settings = useSiteSettings()
  const isMobile = useIsMobile()
  const { goHome } = useSiteNavigation()
  const [sent, setSent] = useState(false)

  // On a phone this is normally reached from the links at the foot of the
  // home screen's category list, alongside About and Privacy, so it's a
  // drill-down like them: "‹ Feedback" in the header, back to home. Tabs are
  // admin-configurable, though, and Feedback can be one (it is in
  // DEFAULT_MOBILE_TABS) — a tab is a top-level screen with nothing to go back
  // to, so then the header names it with no Back, as every tab's page does
  // (useSetTabHeader, the user, Nov 16).
  const tab = settings.feedbackEnabled ? (settings.mobileTabs ?? DEFAULT_MOBILE_TABS).find((t) => t.target === 'feedback') : undefined
  const drillDown = isMobile && !tab
  useSetScreenHeader(drillDown, 'Feedback', goHome)
  useSetTabHeader(tab?.label?.trim() || 'Feedback', isMobile && !!tab)

  const tellUs = useContributions().add
  const heading = settings.feedbackHeading

  return (
    <main className={`${PAGE_COLUMN} pt-4 ${TAB_BAR_CLEARANCE} desktop:pb-12 desktop:pt-8 animate-[fadeIn_180ms_ease-out]`}>
      <PhotoHeader title={heading}>
        <div
          data-testid="page-document"
          className="mb-4 flex flex-col gap-3 desktop:mb-0 desktop:grid desktop:grid-cols-[minmax(0,1fr)_420px] desktop:items-start desktop:gap-8 desktop:pt-3"
        >
          <h1 className={isMobile ? 'sr-only' : 'mx-1 text-[24px] font-extrabold tracking-tight text-slate-900 desktop:hidden'}>{heading}</h1>
          {/* The side column: on a phone only its Tell us card shows, above
              the form; on a computer it sits to the right. */}
          <div className={`${sent ? 'hidden desktop:flex' : 'contents desktop:flex'} desktop:col-start-2 desktop:row-start-1 desktop:flex-col desktop:gap-4`}>
            {tellUs && (
              <>
                <p className={`${EYEBROW} hidden desktop:mt-1.5 desktop:block`}>About a place</p>
                <TellUsCard />
              </>
            )}
            {email && (
              <>
                <p className={`${EYEBROW} hidden desktop:block ${tellUs ? 'desktop:mt-3.5' : 'desktop:mt-1.5'}`}>Rather email?</p>
                <a className={`${HELP_CARD} hidden desktop:flex`} href={`mailto:${email}?subject=${encodeURIComponent('Feedback')}`}>
                  <GlyphDot name="mail" large />
                  <span className="min-w-0 flex-1 break-words text-[16px] font-bold text-blue-700">{email}</span>
                </a>
              </>
            )}
          </div>
          <div className="min-w-0 desktop:col-start-1 desktop:row-start-1">
            <FeedbackForm
              successMessage={settings.feedbackSuccessMessage}
              afterTellUs={tellUs}
              onSentChange={setSent}
            />
          </div>
        </div>
      </PhotoHeader>
    </main>
  )
}
