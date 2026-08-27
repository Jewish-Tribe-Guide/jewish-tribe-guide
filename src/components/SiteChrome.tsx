'use client'

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'
import type { AppMode } from '@/types'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import MobileTabBar from '@/components/MobileTabBar'
import LiveLocationPrompt from '@/components/LiveLocationPrompt'
import ContentFailureNotice from '@/components/ContentFailureNotice'
import { LocationProvider, useLocation } from '@/lib/locationContext'
import { PinnedProvider } from '@/lib/pinnedContext'
import { DroppedPinsProvider } from '@/lib/droppedPinsContext'
import { HeaderCollapseProvider } from '@/lib/headerVisibility'
import { useSiteNavigation } from '@/lib/useSiteNavigation'
import { useCategories } from '@/lib/useCategories'
import { useSiteSettings } from '@/lib/useSiteSettings'
import { DEFAULT_MOBILE_TABS, type MobileTabConfig } from '@/lib/siteSettings'
import { ui } from '@/lib/uiConfig'

// ─────────────────────────────────────────────────────────────────────────────
// The chrome around every public screen: header, footer, mobile tab bar, and
// the shared location state they all read.
//
// Rendered by the community layout, so it persists across navigations between
// screens — the header doesn't remount, the GPS watch isn't restarted, and the
// tab bar doesn't flicker when you move between tabs.
// ─────────────────────────────────────────────────────────────────────────────

/** Which screen the URL is on, in the vocabulary MobileTabBar already speaks.
 *  Derived from the path rather than tracked in state — there is exactly one
 *  source of truth for what's on screen now, and it's the URL. */
function screenFromPath(pathname: string): { mode: AppMode; cardId: string | null } {
  // ['', community, ...rest]
  const rest = pathname.split('/').filter(Boolean).slice(1)
  const first = rest[0]
  if (!first) return { mode: 'home', cardId: null }
  if (first === 'map') return { mode: 'map', cardId: null }
  if (first === 'feedback') return { mode: 'feedback', cardId: null }
  if (first === 'all') return { mode: 'all-categories', cardId: null }
  // Anything else is a category or form slug.
  return { mode: 'find', cardId: first }
}

/** The tab bar, split out because it's the only part of the chrome that needs
 *  the current path — and reading the path suspends during prerendering. On its
 *  own behind a Suspense boundary it costs a tab bar that appears a beat late on
 *  a cold load; folded into the chrome it would have held back the whole page. */
function PathAwareTabBar({ tabs, iconForTarget }: {
  tabs: MobileTabConfig[]
  iconForTarget: (target: string) => string | undefined
}) {
  const pathname = usePathname()
  const { navigate, goHome, openFlow } = useSiteNavigation()
  const { mode, cardId } = screenFromPath(pathname)

  const selectTab = (tab: MobileTabConfig) => {
    if (tab.target === 'categories') goHome()
    else if (tab.target === 'map') navigate(null, 'map')
    else if (tab.target === 'feedback') navigate(null, 'feedback')
    // Anything else is a card id — a category opens its directory, a form
    // opens its wizard. Both live at the same path, so this is one call now;
    // the [slug] route decides which it is. That also retires the old guard
    // that had to tell a deleted category from a valid form id.
    else openFlow(tab.target)
  }

  return (
    <MobileTabBar
      mode={mode}
      tabs={tabs}
      onSelect={selectTab}
      activeCardId={cardId}
      iconForTarget={iconForTarget}
    />
  )
}

function Chrome({ children, year }: { children: React.ReactNode; year: number }) {
  const { controls, liveTracking } = useLocation()
  const { navigate, goHome } = useSiteNavigation()
  const categories = useCategories()
  const settings = useSiteSettings()

  const hasMap = !!categories?.some((c) => c.kind === 'map')

  // `?? DEFAULT_MOBILE_TABS` guards a response from a deployment older than the
  // mobileTabs field (or a stale cached one): the bar is on every mobile
  // screen, so an undefined here would be a crash on load rather than a
  // missing tab.
  const visibleTabs = (settings.mobileTabs ?? DEFAULT_MOBILE_TABS).filter((t) =>
    t.target === 'map' ? hasMap : t.target === 'feedback' ? settings.feedbackEnabled : true,
  )

  return (
    <>
      <SiteHeader onGoHome={goHome} location={controls} />
      {/* Only renders when something actually failed — see its own note for why
          a fallback has to announce itself rather than pass as data. */}
      <ContentFailureNotice />
      {children}
      {/* Desktop only, deliberately — not an oversight, and tried the other
          way once. A phone here is an app shell with a fixed bottom tab bar,
          and a document footer under one reads as a website; none of the
          apps this competes with has one. It also broke the mobile map,
          which is a full-viewport screen that must not scroll. The
          alternative — a More/Settings destination, the native pattern —
          was rejected because the only things left to put in it were two
          links, and folding Feedback in alongside them would bury the one
          action we actually want.
          The consequence to keep in mind: this footer holds the only /about
          link in the app, so About is desktop-only by the same choice.
          /privacy is deliberately NOT in that position — it's linked from
          the forms that collect personal data, which is where it belongs on
          every device (see PrivacyNote). */}
      <div className="hidden desktop:block">
        <SiteFooter onPromoteFeedbackToPage={() => navigate(null, 'feedback')} year={year} />
      </div>
      <Suspense fallback={null}>
        <PathAwareTabBar
          tabs={visibleTabs}
          iconForTarget={(target) => categories?.find((c) => c.id === target)?.icon ?? undefined}
        />
      </Suspense>
      <LiveLocationPrompt
        // !errorSilent: a silent failure means tracking was already on from a
        // previous visit and just quietly dropped (permission revoked between
        // visits, a transient GPS error) — that's not "never asked yet," and
        // popping the first-time "Share your live location?" pitch back up
        // reads as the site not remembering it was already granted. The
        // header pill's own error text (LocationControl) still surfaces what
        // actually happened; this modal just stays out of the way for it.
        enabled={ui.map.liveTracking && !liveTracking.tracking && !liveTracking.errorSilent && !liveTracking.resumingSilently}
        onShare={liveTracking.start}
      />
    </>
  )
}

export default function SiteChrome({
  children,
  year,
}: {
  children: React.ReactNode
  /** Resolved on the server — see the note on SiteFooter's own `year` prop. */
  year: number
}) {
  return (
    <LocationProvider>
      <PinnedProvider>
        <DroppedPinsProvider>
          <HeaderCollapseProvider>
            <Chrome year={year}>{children}</Chrome>
          </HeaderCollapseProvider>
        </DroppedPinsProvider>
      </PinnedProvider>
    </LocationProvider>
  )
}
