import { Suspense } from 'react'
import UpButton from '@/components/UpButton'
import ManageSubscriptionForm from '@/components/ManageSubscriptionForm'
import { getSubscriberByToken } from '@/lib/subscriberStore'
import { listCategoriesUncached } from '@/lib/categoryStore'
import { routes } from '@/lib/routes'

export const metadata = { title: 'Manage your subscription' }

// A plain, top-level page (not under /[community]) — the token alone
// identifies both the subscriber and their community (unsubscribe_token is
// globally unique, not scoped per community), so there's no community
// segment to put this under. Reached from the "Manage your subscription"
// link every notification email carries (see subscriberEmail.ts) — the same
// token the plain unsubscribe link uses, so one link covers both editing
// preferences and leaving entirely, rather than making someone hunt for a
// second link to do the other thing.
//
// `searchParams` is a runtime API under Cache Components (see this app's own
// AGENTS.md note on checking node_modules/next/dist/docs for framework
// mechanics) — reading it at the top of the page would make the whole route
// dynamic and fail to prerender. The fix, straight from that guide's own
// "cookies, headers, and searchParams" section: pass the promise down
// unread and await it inside a <Suspense>-wrapped child instead, so the
// static shell (there isn't much of one here, but the pattern still holds)
// can prerender and only the token-dependent part is request-bound.
export default function ManageSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  return (
    <Suspense fallback={null}>
      <ManageSubscriptionContent searchParams={searchParams} />
    </Suspense>
  )
}

async function ManageSubscriptionContent({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const subscriber = token ? await getSubscriberByToken(token) : null

  if (!subscriber) {
    return (
      <main className="mx-auto max-w-lg px-4 sm:px-6 py-16 text-center">
        <p className="text-sm text-muted">
          This link isn&apos;t valid — it may have already been used to unsubscribe.
        </p>
      </main>
    )
  }

  const categories = (await listCategoriesUncached(subscriber.communityId)).filter((c) => c.kind === 'listing')

  return (
    <main className="mx-auto max-w-lg px-4 sm:px-6 py-12 sm:py-16">
      <UpButton href={routes.home(subscriber.communityId)} label="Home" />
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Manage your subscription</h1>
        <p className="mb-5 text-sm text-muted">{subscriber.email}</p>
        <ManageSubscriptionForm token={token!} subscriber={subscriber} categories={categories} />
      </div>
    </main>
  )
}
