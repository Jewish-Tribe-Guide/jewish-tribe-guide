import type { Metadata } from 'next'
import FeedbackScreen from './FeedbackScreen'
import { siteUrl } from '@/lib/siteUrl'
import { routes } from '@/lib/routes'
import { getPage } from '@/lib/pagesStore'
import { pageBodyToHtml } from '@/lib/richText'
import { firstMailto } from '@/lib/pageSections'

// Self-referencing canonical — see [community]/page.tsx's comment. This file
// is a thin server wrapper specifically so it can export generateMetadata;
// FeedbackScreen carries all the actual ('use client') logic, which a client
// file can't export generateMetadata from.
export async function generateMetadata(props: PageProps<'/[community]/feedback'>): Promise<Metadata> {
  const { community } = await props.params
  return { alternates: { canonical: `${siteUrl()}${routes.feedback(community)}` } }
}

// The computer page's "Rather email?" card gives the address the About page's
// own text gives (one shared row, so one address for every community), and
// is left out when it gives none. There is no per-community contact address.
export default async function FeedbackPage() {
  const about = await getPage('about').catch(() => null)
  return <FeedbackScreen email={firstMailto(pageBodyToHtml(about?.body))} />
}
