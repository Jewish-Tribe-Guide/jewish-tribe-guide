'use client'

import { useCallback, useMemo, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import type { Subscriber } from '@/lib/subscriberStore'
import { useCardOptions } from './HomeSectionManager'

// ── The 'subscribers' tab: everyone who's opted in to "Stay in the Loop"
// (SubscribeSection, desktop-only) — the one piece of this feature that had
// no admin surface at all until now. View + remove only, deliberately: a
// subscriber's own categories/notify preferences are already editable from
// their own "Manage your subscription" link (every notification email
// carries one) — duplicating that here would be a second place the same
// state can drift out of sync. Removing someone here is for the case that
// link can't cover: a bounced or spam address the admin wants gone without
// waiting for that person to unsubscribe themselves. ─────────────────────

export default function SubscriberManager({ token }: { token: string }) {
  const community = useCommunitySlug()
  const cardOptions = useCardOptions()
  const [subscribers, setSubscribers] = useState<Subscriber[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const categoryLabel = useMemo(() => {
    const byId = new Map(cardOptions.map((c) => [c.id, c.label]))
    return (id: string) => byId.get(id) ?? id
  }, [cardOptions])

  const load = useCallback(async () => {
    setError(null)
    try {
      const body = await parseOkJson<{ subscribers: Subscriber[] }>(
        await fetch(withCommunity('/api/admin/subscribers', community), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        'Failed to load subscribers.',
      )
      setSubscribers(body.subscribers)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])

  useLoadOnMount(load)

  async function remove(subscriber: Subscriber) {
    if (!confirm(`Remove ${subscriber.email} from every subscription? This can't be undone from here.`)) return
    setRemoveError(null)
    setRemovingId(subscriber.id)
    try {
      await fetchJson(
        withCommunity(`/api/admin/subscribers/${subscriber.id}`, community),
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
        'Could not remove subscriber.',
      )
      setSubscribers((prev) => prev?.filter((s) => s.id !== subscriber.id) ?? prev)
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Could not remove subscriber.')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div>
      <p className="text-sm text-muted mb-4">
        Everyone who&rsquo;s opted in to email updates for new listings or closures (&ldquo;Stay in
        the Loop&rdquo;, desktop only). Each subscriber manages their own categories and notification
        preferences from the link in every email they get — removing someone here unsubscribes them
        entirely, for an address that&rsquo;s bounced or never should have signed up.
      </p>

      {error && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{error}</p>
      )}
      {removeError && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{removeError}</p>
      )}

      {subscribers === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : subscribers.length === 0 ? (
        <p className="text-sm text-muted">No one has subscribed yet.</p>
      ) : (
        <>
          <p className="text-xs text-muted mb-2">
            {subscribers.length} subscriber{subscribers.length === 1 ? '' : 's'}
          </p>
          {/* Same table shape as CommunityManager's Admins roster — a header
              row naming each column beats a caption baked into every card,
              and it's the pattern this admin console already established for
              "list of people with a couple of attributes and a Remove". */}
          <div className="overflow-x-auto max-w-3xl">
            <table className="w-full text-xs max-sm:block">
              <thead className="max-sm:hidden">
                <tr className="text-left text-slate-400">
                  <th className="font-medium pb-1">Email</th>
                  <th className="font-medium pb-1">Categories</th>
                  <th className="font-medium pb-1">Notifications</th>
                  <th className="font-medium pb-1">Since</th>
                  <th className="w-14" />
                </tr>
              </thead>
              <tbody className="max-sm:block">
                {subscribers.map((s) => (
                  <tr
                    key={s.id}
                    className="border-t border-slate-100 max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-2 max-sm:py-1.5"
                  >
                    <td className="py-1.5 pr-3 font-medium text-slate-900 break-all max-sm:block max-sm:basis-full max-sm:pb-0">
                      {s.email}
                    </td>
                    <td className="py-1.5 pr-3 text-muted max-sm:block max-sm:basis-full">
                      <span className="hidden max-sm:inline text-slate-400">Categories: </span>
                      {s.categories && s.categories.length > 0
                        ? s.categories.map(categoryLabel).join(', ')
                        : 'All categories'}
                    </td>
                    <td className="py-1.5 pr-3 text-muted max-sm:block max-sm:basis-full">
                      <span className="hidden max-sm:inline text-slate-400">Notifications: </span>
                      {[s.notifyAdd && 'New listings', s.notifyClosure && 'Closures'].filter(Boolean).join(' · ') ||
                        'None enabled'}
                    </td>
                    <td className="py-1.5 pr-3 text-muted whitespace-nowrap max-sm:block max-sm:basis-full">
                      <span className="hidden max-sm:inline text-slate-400">Since: </span>
                      {new Date(s.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-1.5 text-right max-sm:ml-auto max-sm:pt-1">
                      <button
                        onClick={() => remove(s)}
                        disabled={removingId === s.id}
                        className="font-medium text-muted hover:text-red-600 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {removingId === s.id ? 'Removing…' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
