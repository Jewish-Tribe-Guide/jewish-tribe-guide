import type { WatchOutcome } from './watches'

// One watch on a page that is both a place's website and its menu link.
// The guide keeps one watch per address, so the Brazilian BBQ's website
// watch never read its menu, and Zevi's Bakery's menu watch never read its
// hours or phone (the user, Nov 4). Such a page is watched as its website
// (hoursJob.ts takes a menu watch over) and the run reads its menu on it
// too (watchRunner.ts). Pure.

/** Each read's fingerprint, kept in the watch's one: the same page drawn
 *  for its hours and for its menu needn't come out the same, and a read
 *  compared with the other's would see a change every night. */
export type PageHashes = { page: string | null; menu: string | null }

const SEP = '+'

export function splitPageHash(stored: string | null | undefined): PageHashes {
  if (!stored) return { page: null, menu: null }
  const at = stored.indexOf(SEP)
  if (at < 0) return { page: stored, menu: stored }
  return { page: stored.slice(0, at) || null, menu: stored.slice(at + 1) || null }
}

/** One fingerprint when they agree, as a page read once is saved. */
export function joinPageHash(page: string | null, menu: string | null): string {
  return page === menu ? (page ?? '') : `${page ?? ''}${SEP}${menu ?? ''}`
}

/** The watch's outcome is its page's: a menu that couldn't be read on a
 *  page that loaded isn't a website that failed. Its fingerprint stays,
 *  so it's read again the next night. A read that saved no fingerprint
 *  (it read nothing) keeps its old one. */
export function mergeSharedPage(old: PageHashes, page: WatchOutcome, menu: WatchOutcome): WatchOutcome {
  const pageHash = page.ok ? page.pageHash : undefined
  const menuHash = menu.ok ? menu.pageHash : undefined
  const hash = pageHash === undefined && menuHash === undefined ? {} : { pageHash: joinPageHash(pageHash ?? old.page, menuHash ?? old.menu) }
  if (!page.ok) return page
  const check = page.check ?? menu.check
  return {
    ok: true,
    filed: page.filed + (menu.ok ? menu.filed : 0),
    ...hash,
    ...(check ? { check } : {}),
    ...(page.skipped ? { skipped: true as const } : {}),
  }
}
