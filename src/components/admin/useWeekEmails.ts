'use client'

import { useCallback, useState } from 'react'
import type { NewsletterLine } from '@/lib/nightKinds'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import type { useAdminApi } from './useAdminApi'

// What a shul's this-week row says when no email reads it yet (Nov 25: it
// was the Read from box's, which went once every row said its own source):
// the guide's Gmail to sign up with, or a sender that came in linked to
// nothing, to link here. Read once, and only for a place that takes emails.

export type WeekEmails = { account: string | null; waiting: { id: string; sender: string } | null; loaded: boolean }

export function useWeekEmails(api: ReturnType<typeof useAdminApi>, enabled: boolean): [WeekEmails, () => Promise<void>] {
  const [got, setGot] = useState<WeekEmails>({ account: null, waiting: null, loaded: false })
  const load = useCallback(async () => {
    if (!enabled) return
    const [own, inbox] = await Promise.all([
      api.get<{ email: string | null }>('/api/admin/community-email').catch(() => null),
      api.get<{ newsletters: NewsletterLine[] }>('/api/admin/watches/newsletters').catch(() => null),
    ])
    const waiting = inbox?.newsletters.find((n) => !n.shul)
    setGot({ account: own?.email ?? null, waiting: waiting ? { id: waiting.watchId, sender: waiting.email } : null, loaded: true })
  }, [api, enabled])
  useLoadOnMount(load)
  return [got, load]
}
