'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { track } from '@vercel/analytics'
import type { CategoryConfig } from '@/lib/categories'
import type { DirectoryResource } from '@/types'
import { searchAsk } from '@/lib/askSearch'
import { parseAsk } from '@/lib/ask'
import { answerFor } from '@/lib/askAnswer'
import { answersWell } from '@/lib/searchPrompts'
import { markTipDone, takeTipVisit, tipCandidates, tipStillOffered } from '@/lib/browsingTips'
import { useCategories } from '@/lib/useCategories'
import { useOptionalCommunitySlug } from '@/lib/communityContext'
import { useNow } from '@/lib/useNow'
import { neighborhoodsFor } from '@/lib/places'
import { routes } from '@/lib/routes'

// "Tip: you can just ask. Try “Where can I get challah?”" — see
// browsingTips.ts for when it shows and how the example is chosen.
export default function AskTip({ category, items }: { category: CategoryConfig; items: readonly DirectoryResource[] }) {
  const community = useOptionalCommunitySlug()
  const categories = useCategories() ?? [category]
  const now = useNow()
  // Most visits: the tip has been seen twice or retired, so skip working
  // out an example at all. Read once; either way nothing renders until the
  // effect below, so the server's render and the browser's first agree.
  const [offered] = useState(tipStillOffered)
  const places = neighborhoodsFor(community)
  // Each example run through the real search first, and offered only if
  // it answers well. "Next minyan" is the exception: its answer comes from
  // the schedules, which this page doesn't load, and tipCandidates only
  // offers it when the shuls have times, so there's always a next one.
  const question = !offered ? undefined : tipCandidates(category, items, categories).find((q) => {
    if (parseAsk(q).minyan) return true
    const result = searchAsk(items, categories, q, { now: new Date(now), places })
    return answersWell(answerFor(result), result.hits.length)
  })

  // Decided once per visit, after mount: whether to show depends on this
  // browser's storage, which the server can't see, and counting the visit
  // is a write that belongs in an effect. Only a visit that has something
  // to suggest counts: WhatsApp Groups mustn't use up the two.
  const [show, setShow] = useState(false)
  const taken = useRef(false)
  useEffect(() => {
    if (!question || taken.current) return
    taken.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (takeTipVisit()) setShow(true)
  }, [question])

  if (!show || !question || !community) return null

  const done = (how: 'tapped' | 'dismissed') => {
    markTipDone()
    track('ask_tip', { how })
  }
  return (
    <p className="flex items-start gap-2 text-[13px] text-slate-500" data-testid="ask-tip">
      <span className="min-w-0 flex-1">
        Tip: you can just ask. Try{' '}
        <Link href={routes.ask(community, question)} onClick={() => done('tapped')} className="font-medium text-brand-teal hover:text-brand-teal-dark hover:underline">
          “{question}”
        </Link>
      </span>
      <button
        type="button"
        aria-label="Hide this tip"
        onClick={() => {
          done('dismissed')
          setShow(false)
        }}
        className="shrink-0 cursor-pointer px-1 text-slate-400 hover:text-slate-600"
      >
        ×
      </button>
    </p>
  )
}
