import type { Metadata } from 'next'
import { Suspense } from 'react'
import HomeScreen from '../../HomeScreen'
import { ListingsProvider } from '@/lib/listingsContext'
import { listApprovedResources } from '@/lib/resourceStore'
import { listCategories } from '@/lib/categoryStore'
import { listCommunities } from '@/lib/communityStore'
import { getSiteSettings } from '@/lib/siteSettingsStore'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import { neighborhoodsFor } from '@/lib/places'
import { candidatePrompts } from '@/lib/searchPrompts'
import { DAY_KEYS } from '@/lib/hours'
import { questionFromSlug, questionSlug, questionTitle, shareSummary } from '@/lib/shareAnswer'
import { routes } from '@/lib/routes'
import { siteUrl } from '@/lib/siteUrl'

// ─────────────────────────────────────────────────────────────────────────────
// A shared search answer — /philly/ask/challah-near-rittenhouse — the link the
// answer's Share button copies (see shareAnswer.ts). The home screen, with the
// question already asked, and a link preview that answers it.
//
// The answer itself is worked out in the browser, like any search: "open now"
// and the next minyan depend on the visitor's clock, which a page built ahead
// of time can't know. Only the preview is built here, from facts that hold
// whenever it's read.
//
// Not indexed: every question anyone types is a URL here, and a search
// engine filling up with them helps nobody. The home page is the page to
// find.
//
// generateStaticParams for the same reason as [slug]/[id]/page.tsx: with
// Cache Components, a dynamic segment that resolves no params at build time
// makes Next prerender a paramless shell, which trips on the root layout's
// dynamic reads. The questions offered under the search box are the natural
// ones to build ahead; any other question renders on first request.
// ─────────────────────────────────────────────────────────────────────────────

// The community itself is checked by [community]/layout.tsx, which 404s an
// unknown one before anything streams.
export async function generateMetadata(props: PageProps<'/[community]/ask/[question]'>): Promise<Metadata> {
  const { community, question: segment } = await props.params
  const question = questionFromSlug(segment)
  const communities = await listCommunities().catch(() => [])
  const site = communities.find((c) => c.slug === community)
  if (!question || !site) return { robots: { index: false, follow: true } }

  const [settings, listings, categories] = await Promise.all([
    getSiteSettings(community).catch(() => SITE_SETTINGS_DEFAULTS),
    listApprovedResources(community).catch(() => []),
    listCategories(community).catch(() => []),
  ])
  const siteName = settings.name || site.name
  const title = `${questionTitle(question)} · ${siteName}`
  const description = shareSummary(question, listings, categories, neighborhoodsFor(community))

  return {
    title,
    description,
    alternates: { canonical: `${siteUrl()}${routes.ask(community, question)}` },
    robots: { index: false, follow: true },
    openGraph: { title, description, siteName, type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

export async function generateStaticParams() {
  const communities = await listCommunities().catch(() => [])
  // Every question the box might offer, at any time of any day.
  const questions = new Set<string>()
  for (const day of DAY_KEYS) {
    for (let hour = 0; hour < 24; hour++) {
      for (const q of candidatePrompts({ day, minutes: hour * 60 })) questions.add(questionSlug(q))
    }
  }
  return communities.flatMap((c) => [...questions].map((question) => ({ community: c.slug, question })))
}

// The params are read inside the boundary, so a question nobody built ahead
// still gets the page's shell straight away and the rest streams in, rather
// than the whole page waiting on it.
export default function AskPage(props: PageProps<'/[community]/ask/[question]'>) {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <AskContent params={props.params} />
    </Suspense>
  )
}

// A link with no readable question in it (mangled in the copying, or
// longer than any question) opens the plain home page rather than a 404:
// the shell has already been sent by the time the question is read, so a
// 404 here would arrive as a 200 anyway, and the home page is the useful
// thing to land on.
async function AskContent({ params }: { params: PageProps<'/[community]/ask/[question]'>['params'] }) {
  const { community, question: segment } = await params
  const question = questionFromSlug(segment) ?? undefined
  const listings = await listApprovedResources(community).catch((err) => {
    console.error('[ask] listings failed to load:', err)
    return null
  })
  return (
    <ListingsProvider listings={listings}>
      <HomeScreen initialQuery={question} />
    </ListingsProvider>
  )
}
