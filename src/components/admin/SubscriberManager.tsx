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
          <div className="space-y-2 max-w-3xl">
            {subscribers.map((s) => (
              <div
                key={s.id}
                className="bg-white border border-slate-200 rounded-lg p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{s.email}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {s.categories && s.categories.length > 0
                      ? s.categories.map(categoryLabel).join(', ')
                      : 'All categories'}
                  </p>
                  <p className="text-[11px] text-muted mt-1">
                    {[s.notifyAdd && 'New listings', s.notifyClosure && 'Closures'].filter(Boolean).join(' · ') ||
                      'No notifications enabled'}
                    {' — since '}
                    {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => remove(s)}
                  disabled={removingId === s.id}
                  className="shrink-0 text-xs text-muted hover:text-red-600 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {removingId === s.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
