import { fetchHome } from '@/lib/hoursJobRun'
import { readEruvPage } from '@/lib/eruvReader'
import { eruvPages } from '@/lib/hoursPages'
import type { StatusWrite } from '@/lib/eruvStore'

// Finding an eruv's status page on its own website (step 5, Oct 21: "An
// eruv is found from its website"). Its home page and the links on it that
// may post its status (eruvPages), each read with the same reader the site
// uses (readEruvPage), and kept if it says the eruv is up or down.
//
// Offered, never set on its own: an eruv's status goes live with no
// approval, so a page read wrong would tell people they can carry when they
// can't. An admin picks the page, as they give one today. Fetches only, no
// AI; run from the Eruv status page's "Find it on its website".

export type FoundStatusPage = { url: string; link: string | null; status: 'up' | 'down'; words: string | null }

export type EruvReach = {
  fetchHome?: (url: string) => Promise<{ url: string; body: string } | { error: string }>
  readPage?: (url: string, now: Date) => Promise<StatusWrite>
}

export async function findEruvStatusPages(website: string, reach: EruvReach = {}, now = new Date()): Promise<{ found: FoundStatusPage[] } | { error: string }> {
  const home = await (reach.fetchHome ?? fetchHome)(website)
  if ('error' in home) return home
  const pages = eruvPages(home.url, home.body)
  const reads = await Promise.all(pages.map((p) => (reach.readPage ?? readEruvPage)(p.url, now).catch(() => null)))
  const found: FoundStatusPage[] = []
  pages.forEach((p, i) => {
    const r = reads[i]
    if (r?.ok && (r.status === 'up' || r.status === 'down')) found.push({ url: p.url, link: p.link, status: r.status, words: r.words })
  })
  return { found }
}
