'use client'

import FeedbackForm from '@/components/FeedbackForm'
import { useSiteSettings } from '@/lib/useSiteSettings'
import { useIsMobile } from '@/lib/useIsMobile'
import { useSiteNavigation } from '@/lib/useSiteNavigation'

// Feedback is a real page on mobile (it has its own tab) and a modal over the
// home screen on desktop (where it doesn't). That split used to be recomputed
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

  if (!isMobile) {
    // Desktop: the modal belongs over the home screen, so send the visitor
    // there and let the footer's own modal open. Rendering a bare feedback
    // page at desktop width would be a screen the site otherwise never shows.
    return (
      <main className="flex flex-1 flex-col w-full max-w-4xl mx-auto px-4 pt-8 pb-8">
        <FeedbackForm
          heading={settings.feedbackHeading}
          successMessage={settings.feedbackSuccessMessage}
          onClose={goHome}
        />
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col w-full max-w-4xl mx-auto px-4 pt-8 pb-24">
      <FeedbackForm
        variant="inline"
        heading={settings.feedbackHeading}
        successMessage={settings.feedbackSuccessMessage}
      />
    </main>
  )
}
