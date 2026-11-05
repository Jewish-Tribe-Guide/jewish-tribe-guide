import { isJoinLink } from './calendarFeed'

// ── A minyan's links, read off the shul's own page (Nov 5) ──────────────────
// A shul's page links its WhatsApp group or its Zoom as a button: "Join
// our WhatsApp group", the address only behind it. The page's words alone
// (htmlToText) dropped every address, so the reader never saw one, and a
// week's minyan took the usual one's group instead. The user, Nov 5: is
// our reader "smart enough to grab those things from the site/newsletter
// itself rather than take from the usual times".

/** A group a sign-up minyan gathers in: a WhatsApp group or chat, a
 *  GroupMe, or a sign-up form. */
export function isGroupLink(link: string): boolean {
  let u: URL
  try {
    u = new URL(link)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  const path = u.pathname.replace(/\/+$/, '')
  if (host === 'chat.whatsapp.com') return /^\/[\w-]{10,}$/.test(path)
  if (host === 'wa.me') return /^\/\d{7,15}$/.test(path)
  if (host === 'groupme.com') return /^\/join_group\//.test(path)
  if (host === 'forms.gle') return path.length > 1
  if (host === 'docs.google.com') return /^\/forms\//.test(path)
  if (host === 'signupgenius.com' || host.endsWith('.signupgenius.com')) return /^\/go\//.test(path)
  return false
}

/** A link a minyan's row can carry: its group, or where to join it from home. */
export const isMinyanLink = (link: string) => isGroupLink(link) || isJoinLink(link)

/** A page with each minyan link's address beside its words, "Join our
 *  WhatsApp group (https://chat.whatsapp.com/Ab12…)", so the reader sees
 *  it. Every other link stays words only, as before: its addresses would
 *  crowd the times out of the reader's window. */
export function withMinyanLinks(html: string): string {
  return html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, (whole, attrs: string, inner: string) => {
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1].replace(/&amp;/g, '&').trim()
    return href && isMinyanLink(href) ? `${inner} (${href})` : whole
  })
}

/** A link the AI gave for a minyan, kept only when it's that kind of link
 *  and written in the message itself: never one it made up or misread. */
export function linkFromMessage(v: unknown, text: string | null, kind: (link: string) => boolean): string | null {
  if (typeof v !== 'string' || text === null) return null
  const link = v.trim().replace(/[).,;]+$/, '')
  return link.length <= 300 && kind(link) && text.includes(link) ? link : null
}
