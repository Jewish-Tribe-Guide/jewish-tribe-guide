import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { withCommunity } from '@/lib/useCommunityData'
import { readMenuLink } from '@/lib/menuLink'
import type { MenuWhy } from '@/app/api/message/read/route'

// ── Reading a menu link typed into the editor (the user, Oct 20) ─────────────
// A food place's menu link, typed on its Main dishes screen, used to be
// kept as a link and nothing more: adding a place by hand, its dishes had to
// be typed in too, and the daily menu watch only reads a menu once it has
// seen it change. Now leaving the box with a new link sends it to the same
// menu reader the "+ Add" box uses (/api/message/read, mode=menu), and the
// dishes it finds go into the list for the contributor to check, then on to
// an admin with everything else. The AI reads the place's own page; it never
// supplies a dish the page doesn't name (menuReader.ts).
//
// Once per link, and only where a person is sending (no admin console, no
// preview): each read is a model call behind the bot check, so it waits for
// the check's token and spends it, and Send waits for the next one.

export type MenuRead =
  | { url: string; status: 'reading' }
  | { url: string; status: 'read'; added: number }
  | { url: string; status: 'failed'; why: MenuWhy | 'error' }

type Options = {
  enabled: boolean
  community: string
  /** The name being added, or the listing's: what the reader looks for. */
  placeName: string
  /** The link already on the listing, which isn't read again. */
  stored: string | undefined
  token: string
  /** Whether a read has to wait for a bot-check token. */
  needsToken: boolean
  resetToken: () => void
  /** Puts the dishes in the list; says how many weren't there already. */
  onDishes: (names: string[]) => number
}

export function useMenuRead({ enabled, community, placeName, stored, token, needsToken, resetToken, onDishes }: Options) {
  const [state, setState] = useState<MenuRead | null>(null)
  // The link whose read has gone out: a read waits for its token, once.
  const sent = useRef<string | null>(null)
  // The latest of each, for a read that finishes after a few renders.
  const latest = useRef({ placeName, onDishes, resetToken })
  useLayoutEffect(() => {
    latest.current = { placeName, onDishes, resetToken }
  })

  /** The link as it is when the box is left: read, if it's a new one. */
  const request = (raw: unknown) => {
    if (!enabled) return
    const url = readMenuLink(raw)
    if (!url || url === readMenuLink(stored) || url === state?.url) return
    setState({ url, status: 'reading' })
  }

  const waiting = state?.status === 'reading' ? state.url : null
  useEffect(() => {
    if (!waiting || sent.current === waiting || (needsToken && !token)) return
    const url = waiting
    sent.current = url
    const body = new FormData()
    body.set('text', url)
    body.set('mode', 'menu')
    body.set('placeName', latest.current.placeName.trim() || 'this place')
    body.set('turnstileToken', token)
    body.set('company', '')
    // A token is good for one request.
    if (needsToken) latest.current.resetToken()
    const settle = (next: MenuRead | null) => setState((s) => (s?.url === url ? next : s))
    void (async () => {
      try {
        const res = await fetch(withCommunity('/api/message/read', community), { method: 'POST', body })
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; proposals?: { kind: string; why?: MenuWhy; items?: { name: string }[] }[] }
        // No AI on this deploy: nothing to say, the link is kept.
        if (json.code === 'off') return settle(null)
        const p = json.ok ? json.proposals?.[0] : undefined
        if (p?.kind === 'items' && p.items?.length) return settle({ url, status: 'read', added: latest.current.onDishes(p.items.map((i) => i.name)) })
        settle({ url, status: 'failed', why: p?.why ?? 'error' })
      } catch {
        settle({ url, status: 'failed', why: 'error' })
      }
    })()
  }, [waiting, needsToken, token, community])

  return { menuRead: state, readMenuLinkNow: request }
}

/** What the line under the link says. */
export function menuReadText(read: MenuRead): string {
  if (read.status === 'reading') return 'Reading the menu for its main dishes…'
  if (read.status === 'read') {
    return read.added === 0
      ? 'The menu’s main dishes are already here.'
      : `Added ${read.added} ${read.added === 1 ? 'dish' : 'dishes'} from the menu. Take out any that aren’t right.`
  }
  switch (read.why) {
    case 'ordering_app':
      return 'Delivery apps don’t let us read their menus. Add the dishes yourself.'
    case 'wont_open':
      return 'That page wouldn’t open, so no dishes were read.'
    case 'no_dishes':
      return 'No main dishes found on that page.'
    default:
      return 'Couldn’t read the menu just now. The link is kept.'
  }
}
