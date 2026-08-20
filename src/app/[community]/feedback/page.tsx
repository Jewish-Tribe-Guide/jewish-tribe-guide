import type { Metadata } from 'next'
import FeedbackScreen from './FeedbackScreen'
import { siteUrl } from '@/lib/siteUrl'
import { routes } from '@/lib/routes'

// Self-referencing canonical — see [community]/page.tsx's comment. This file
// is a thin server wrapper specifically so it can export generateMetadata;
// FeedbackScreen carries all the actual ('use client') logic, which a client
// file can't export generateMetadata from.
export async function generateMetadata(props: PageProps<'/[community]/feedback'>): Promise<Metadata> {
  const { community } = await props.params
  return { alternates: { canonical: `${siteUrl()}${routes.feedback(community)}` } }
}

export default function FeedbackPage() {
  return <FeedbackScreen />
}
