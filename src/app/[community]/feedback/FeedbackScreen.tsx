'use client'

import FeedbackForm from '@/components/FeedbackForm'
import { useSiteSettings } from '@/lib/useSiteSettings'
import { useIsMobile } from '@/lib/useIsMobile'
import { useSiteNavigation } from '@/lib/useSiteNavigation'
import { useSetScreenHeader } from '@/lib/headerVisibility'
import { PAGE_COLUMN } from '@/lib/pageColumn'
import { DEFAULT_MOBILE_TABS } from '@/lib/siteSettings'

// Feedback is a real page on mobile and a modal over the home screen on
// desktop. That split used to be recomputed
// from `mode` on every render in page.tsx so a desktop/mobile resize couldn't
// strand the visitor on a bare inline page; it survives here as the same
// derivation, just against a URL instead of a mode.
//
// Split out of page.tsx (which is now a thin server wrapper exporting
// generateMetadata — a 'use client' file can't export that) so the page can
// have its own canonical tag, same as every other screen under [community].
export default function FeedbackScreen() {
  const settings = useSiteSettings()
  const isMobile = useIsMobile()
  const { goHome } = useSiteNavigation()

  // On a phone this is normally reached from the links at the foot of the
  // home screen's category list, alongside About and Privacy, so it's a
  // drill-down like them: "‹ Feedback" in the header, back to home. Tabs are
  // admin-configurable, though, and Feedback can be one (it is in
  // DEFAULT_MOBILE_TABS) — a tab is a top-level screen with nothing to go back
  // to, so then it keeps the site header and shows its own heading instead.
  const isTab =
    settings.feedbackEnabled && (settings.mobileTabs ?? DEFAULT_MOBILE_TABS).some((t) => t.target === 'feedback')
  const drillDown = isMobile && !isTab
  useSetScreenHeader(drillDown, 'Feedback', goHome)

  if (!isMobile) {
    // Desktop: the modal belongs over the home screen, so send the visitor
    // there and let the footer's own modal open. Rendering a bare feedback
    // page at desktop width would be a screen the site otherwise never shows.
    return (
      <main className="flex flex-1 flex-col w-full max-w-4xl mx-auto px-4 pt-8 pb-8 animate-[fadeIn_180ms_ease-out]">
        <FeedbackForm
          heading={settings.feedbackHeading}
          successMessage={settings.feedbackSuccessMessage}
          onClose={goHome}
        />
      </main>
    )
  }

  return (
    <main className={`${PAGE_COLUMN} flex flex-1 flex-col pt-4 pb-24 animate-[fadeIn_180ms_ease-out]`}>
      <FeedbackForm
        variant="inline"
        heading={settings.feedbackHeading}
        successMessage={settings.feedbackSuccessMessage}
        headingHidden={drillDown}
      />
    </main>
  )
}
