'use client'

import { useEffect, useState } from 'react'
import type { DirectoryResource } from '@/types'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import TurnstileWidget from '@/components/TurnstileWidget'
import { TURNSTILE_ACTIVE } from './useListingSubmit'
import FreshnessFooter from './FreshnessFooter'

// ── A group's join link: does it still work? ─────────────────────────────────
// All a WhatsApp group's listing really holds is what it's for and the link,
// and what goes wrong is the link. So that's what it asks about (agreed
// Sep 30): its dated line sits under Join, and whoever just tapped Join is
// asked, on coming back, whether it opened the group. They're the one person
// who knows, and wouldn't open an edit form to say so.
//
// Yes is the listing's own confirm (no bot check, as everywhere). No files a
// removal request with the reason as its note: the queue shows a removal's
// note in full, where an edit's note isn't shown, and a moderator can reject
// it and fix the link instead of removing the group.

type Phase = 'idle' | 'asking' | 'confirming' | 'reporting' | 'thanks-yes' | 'thanks-no' | 'failed'

export const JOIN_BROKEN_NOTE = 'The join link didn’t work: someone tapped Join on the listing and said it didn’t open the group.'

export default function JoinLinkCheck({ item, joined }: { item: DirectoryResource; joined: boolean }) {
  const community = useCommunitySlug()
  const [phase, setPhase] = useState<Phase>('idle')
  const [token, setToken] = useState('')

  // Back from the group (the link opens a new tab or the WhatsApp app): ask.
  useEffect(() => {
    if (!joined || phase !== 'idle') return
    const back = () => {
      if (document.visibilityState === 'visible') setPhase('asking')
    }
    window.addEventListener('focus', back)
    document.addEventListener('visibilitychange', back)
    return () => {
      window.removeEventListener('focus', back)
      document.removeEventListener('visibilitychange', back)
    }
  }, [joined, phase])

  const yes = async () => {
    setPhase('confirming')
    try {
      const res = await fetch(`/api/resource/${item.id}/confirm`, { method: 'POST' })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean }
      setPhase(res.ok && body.ok ? 'thanks-yes' : 'failed')
    } catch {
      setPhase('failed')
    }
  }

  // The report goes once the bot check has passed (or straight away where
  // there's none configured), as QuestionCard's answers do.
  useEffect(() => {
    if (phase !== 'reporting' || (TURNSTILE_ACTIVE && !token)) return
    let cancelled = false
    fetch(withCommunity('/api/submissions', community), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'delete', targetType: 'listing', targetId: item.id, note: JOIN_BROKEN_NOTE, company: '', turnstileToken: token }),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean }
        if (!cancelled) setPhase(res.ok && body.ok ? 'thanks-no' : 'failed')
      })
      .catch(() => {
        if (!cancelled) setPhase('failed')
      })
    return () => {
      cancelled = true
    }
  }, [phase, token, community, item.id])

  const button = 'h-9 cursor-pointer rounded-full border border-slate-300 bg-white px-3.5 text-[14px] font-semibold text-slate-900 hover:bg-slate-50 disabled:cursor-default disabled:opacity-60'

  if (phase === 'idle') return <FreshnessFooter resourceId={item.id} confirmedAt={item.confirmedAt} subject="Join link" />
  if (phase === 'thanks-yes') return <p className="text-[14px] text-emerald-700" role="status">Thanks! It’s marked as working.</p>
  if (phase === 'thanks-no') return <p className="text-[14px] text-emerald-700" role="status">Thanks for saying. An admin will check the link.</p>

  const busy = phase === 'confirming' || phase === 'reporting'
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" data-testid="join-link-check">
      <p className="text-[15.5px] font-semibold text-slate-900">Did the link work?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={yes} className={button}>
          Yes, it opened the group
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setToken('')
            setPhase('reporting')
          }}
          className={button}
        >
          No, it didn’t
        </button>
      </div>
      {phase === 'failed' && (
        <p role="alert" className="mt-2 text-[13.5px] text-red-700">
          That didn’t send. Please try again.
        </p>
      )}
      {busy && <p className="mt-2 text-[13px] text-slate-500">Sending…</p>}
      {phase === 'reporting' && <TurnstileWidget onVerify={setToken} />}
    </div>
  )
}
