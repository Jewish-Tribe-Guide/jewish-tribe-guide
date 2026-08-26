import Link from 'next/link'
import type { Metadata } from 'next'
import { community } from '@/community.config'
import { siteUrl } from '@/lib/siteUrl'
import { getPage } from '@/lib/pagesStore'

export const metadata: Metadata = {
  title: `About — ${community.name}`,
  description: `The story behind the ${community.name} guide.`,
  alternates: { canonical: `${siteUrl()}/about` },
}

// A plain, top-level page (not under /[community]) — same reasoning as
// /privacy: this is one site's worth of copy, not something that varies by
// community. Content is admin-editable (see /admin's Pages tab); this
// component only renders it.
export default async function AboutPage() {
  const page = await getPage('about')
  const title = page?.title ?? 'About'
  const paragraphs = (page?.body ?? '').split(/\n\s*\n/).filter((p) => p.trim())

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-16">
      <Link href="/" className="text-sm text-muted hover:text-slate-700 underline">
        ← Back to {community.name}
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-900">{title}</h1>

      <div className="mt-8 space-y-4 text-sm leading-relaxed text-slate-700">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </main>
  )
}
