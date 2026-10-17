'use client'

import FeedbackForm from '@/components/FeedbackForm'
import { useSiteSettings } from '@/lib/useSiteSettings'
import { useIsMobile } from '@/lib/useIsMobile'
import { useSiteNavigation } from '@/lib/useSiteNavigation'
import { useSetScreenHeader } from '@/lib/headerVisibility'
import { PAGE_COLUMN } from '@/lib/pageColumn'
import { DEFAULT_MOBILE_TABS } from '@/lib/siteSettings'

// Feedback is a page at every width, in the same column as About and Privacy
// (PAGE_COLUMN): a card holding the form. On a desktop it's normally opened as
// a dialog from the footer or the header's More menu, over the page someone is
// reading — which is what feedback is usually about — so this URL is reached
// there only by a typed or shared link. It used to answer that with the same
// dialog over an empty <main>, closing to the home screen: a dialog over
// nothing (Oct 15).
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

  // pb-24 clears the phone's tab bar; on a desktop the padding is the pages'.
  return (
    <main className={`${PAGE_COLUMN} flex flex-1 flex-col pt-4 pb-24 desktop:py-16 animate-[fadeIn_180ms_ease-out]`}>
      <FeedbackForm
        variant="inline"
        heading={settings.feedbackHeading}
        successMessage={settings.feedbackSuccessMessage}
        headingHidden={drillDown}
      />
    </main>
  )
}
