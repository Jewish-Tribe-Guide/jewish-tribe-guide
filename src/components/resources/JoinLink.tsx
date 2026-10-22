'use client'

import { track } from '@vercel/analytics'
import { joinAction } from '@/lib/davening'

/** "Join on Zoom": a minyan's join link, the whole phrase the link, on the
 *  minyan's own row (the user, Oct 22). Nothing for a link that isn't a
 *  web address. `what` names the minyan where it isn't on its row. */
export function JoinLink({ link, what, className = '' }: { link: string | undefined; what?: string; className?: string }) {
  const action = joinAction(link, what)
  if (!action) return null
  return (
    <a
      href={action.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track('listing_action', { action: 'Join a minyan online' })}
      className={`font-bold text-primary hover:underline ${className}`}
      data-testid="join-link"
    >
      {action.label}
    </a>
  )
}
