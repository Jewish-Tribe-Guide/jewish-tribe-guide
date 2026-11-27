'use client'

import { track } from '@vercel/analytics'
import { askMessage } from '@/lib/shareAnswer'
import { useShareLink } from '@/lib/useShareLink'
import { PlusIcon } from '@/components/icons'

// The last thing a search that found nothing shows: that the guide doesn't
// have it, and one way to ask the people who might. After whatever is close
// (see nearMiss), never instead of it.
//
// "Ask in a WhatsApp group" opens the phone's share menu with the question
// written (WhatsApp has no link that types into a group), ending with the
// question's own link, which answers it once someone adds the answer. On a
// computer it copies the question.
//
// Nothing else (the user, Oct 10): the line explaining the share menu, "Know
// where to find it? Add it to the guide" and "See the community's groups"
// were distracting and little used.
//
// On a category page only that category was searched, so the card says so
// ("Nothing in Food for …"). Its "Search the whole guide" went Nov 27
// (board R2): they can go back and search. In its place, under the ask,
// Add what was searched for, opening Find the place already searching.

export type AskGroupProps = {
  nothingClose: boolean
  /** The question's own page (routes.ask), sent with the question. */
  sharePath: string
  /** A category page's search: what was searched. */
  scope?: { label: string }
  /** Add what was searched for (board R2). */
  onAdd?: () => void
}

export default function AskTheGroup({ query, nothingClose, sharePath, scope, onAdd, className = '' }: AskGroupProps & { query: string; className?: string }) {
  const { share, copied } = useShareLink(sharePath, query, () => askMessage(query))
  return (
    <div className={`rounded-xl border border-slate-200 bg-white px-3.5 py-3 ${className}`} data-testid="ask-the-group">
      <p className="text-[0.875rem] font-semibold leading-snug text-ink">
        {nothingClose ? `Nothing in ${scope ? scope.label : 'the guide'} for “${query}”.` : 'Not what you’re looking for?'}
      </p>
      <button
        type="button"
        onClick={() => {
          track('asked_group')
          void share()
        }}
        className="mt-2.5 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-primary text-[0.9375rem] font-bold text-white transition-colors hover:bg-primary-dark"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
          <path d="M10 3v10M6 7l4-4 4 4M4 12v3a2 2 0 002 2h8a2 2 0 002-2v-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {copied ? 'Question copied: paste it in the group' : 'Ask in a WhatsApp group'}
      </button>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-2 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-slate-300 bg-white text-[0.9375rem] font-bold text-primary-dark transition-colors hover:bg-slate-50"
        >
          <PlusIcon className="h-4 w-4" />
          Add {query}
        </button>
      )}
    </div>
  )
}
