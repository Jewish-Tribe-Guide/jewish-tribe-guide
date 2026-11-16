// About and Privacy (boards of Nov 15, "About v2" and "Privacy and terms")
// are laid out from the shape of their admin-written text, so an admin edits
// the words in the Pages tab and the page keeps its layout:
//
// - text before the first heading is the page's opening line (About's
//   mission, drawn large);
// - each heading starts a section;
// - a section whose list has a bold lead on every item ("<strong>Visiting.
//   </strong> Where to daven…") is a set of named points, which About draws
//   as cards and Privacy as rows with an icon (its short version) or as a
//   list with bold leads (the rest).
//
// Works on sanitized HTML only (pageBodyToHtml), whose tags are a short
// allowlist with no attributes but a link's href, so plain pattern matching
// is enough here; it is never run on raw input.

import { splitPageSections } from './richText'

export type PagePoint = {
  /** The bold lead, as text ("Visiting"). */
  title: string
  /** The rest of the item, as sanitized HTML. */
  html: string
}

export type PageSection = {
  /** For the contents list's links: "what-you-tell-us". */
  id: string
  heading: string
  /** Everything after the heading, as sanitized HTML. */
  html: string
  /** When the section is a list of named points (see the note above): the
   *  points, and any paragraphs before and after the list. */
  points: { before: string; items: PagePoint[]; after: string } | null
}

export type PageDocumentParts = {
  /** What comes before the first heading, as sanitized HTML, or null. */
  lead: string | null
  sections: PageSection[]
}

export const textOf = (html: string) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

export function sectionId(heading: string): string {
  return (
    heading
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'section'
  )
}

/** A list whose every item opens with a bold lead, and the paragraphs around
 *  it. Null for anything else, including a second list or a plain one. */
export function pointsOf(html: string): PageSection['points'] {
  const lists = [...html.matchAll(/<(ul|ol)>([\s\S]*?)<\/\1>/g)]
  if (lists.length !== 1) return null
  const [whole, , inner] = lists[0]
  // A nested list would have closed the match early.
  if (/<(ul|ol)>/.test(inner)) return null
  const items: PagePoint[] = []
  for (const li of inner.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const m = li[1].trim().match(/^(?:<p>)?\s*<strong>([\s\S]*?)<\/strong>([\s\S]*)$/)
    if (!m) return null
    const title = textOf(m[1])
    if (!title) return null
    const rest = m[2].replace(/<\/p>\s*$/, '').trim()
    items.push({ title, html: rest })
  }
  if (items.length === 0) return null
  const at = html.indexOf(whole)
  return { before: html.slice(0, at).trim(), items, after: html.slice(at + whole.length).trim() }
}

export function pageDocumentParts(html: string): PageDocumentParts {
  let lead: string | null = null
  const sections: PageSection[] = []
  const used = new Set<string>()
  for (const chunk of splitPageSections(html)) {
    const m = chunk.match(/^\s*<h2>([\s\S]*?)<\/h2>([\s\S]*)$/)
    if (!m) {
      lead = chunk.trim() || null
      continue
    }
    const heading = textOf(m[1])
    const body = m[2].trim()
    let id = sectionId(heading)
    for (let n = 2; used.has(id); n++) id = `${sectionId(heading)}-${n}`
    used.add(id)
    sections.push({ id, heading, html: body, points: pointsOf(body) })
  }
  return { lead, sections }
}

/** About's rows: two plain sections in a row sit side by side on a computer
 *  ("The problem" and "What the guide does"), named points are a row of
 *  cards, and a plain section left over stands alone ("Who runs it", which
 *  the page puts beside its ways to help). */
export type AboutBlock =
  | { kind: 'pair'; sections: [PageSection, PageSection] }
  | { kind: 'cards'; section: PageSection }
  | { kind: 'single'; section: PageSection }

export function aboutBlocks(sections: readonly PageSection[]): AboutBlock[] {
  const blocks: AboutBlock[] = []
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]
    if (s.points && !s.points.before && !s.points.after) {
      blocks.push({ kind: 'cards', section: s })
      continue
    }
    const next = sections[i + 1]
    const nextIsPlain = next && !(next.points && !next.points.before && !next.points.after)
    if (nextIsPlain) {
      blocks.push({ kind: 'pair', sections: [s, next] })
      i++
      continue
    }
    blocks.push({ kind: 'single', section: s })
  }
  return blocks
}

/** The line icon for a named point, from the words in its lead. Words an
 *  admin might reasonably write for each idea; anything else gets the check
 *  mark, so a renamed point still has an icon. */
export type PointGlyph =
  | 'home' | 'bag' | 'hospital' | 'people' | 'star' | 'clock' | 'pin'
  | 'user' | 'bookmark' | 'tag' | 'read' | 'check'

const GLYPH_WORDS: [RegExp, PointGlyph][] = [
  [/\bhospital|patient/, 'hospital'],
  [/\bvisit|travel/, 'bag'],
  [/\bliv(e|es|ing) here|resident|\blocal/, 'home'],
  [/kind of jew|denomination|every stream|every shul/, 'star'],
  [/\bfix|\banyone\b|community-kept|kept by/, 'people'],
  [/\bchecked\b|\bdated\b|how recent|when it was/, 'clock'],
  [/one community|in depth/, 'pin'],
  [/\baccount|sign up|sign-up/, 'user'],
  [/\bsave|stays with you|on your device/, 'bookmark'],
  [/\bsold\b|\bsell\b|\bads?\b/, 'tag'],
  [/\bai\b|reads, it|doesn.t answer/, 'read'],
]

export function pointGlyph(title: string): PointGlyph {
  const t = title.toLowerCase()
  return GLYPH_WORDS.find(([re]) => re.test(t))?.[1] ?? 'check'
}

/** The first email address the page links to, for About's "Help run the
 *  guide" and "Start a guide" cards, so the address lives in the text an
 *  admin edits rather than in code. */
export function firstMailto(html: string): string | null {
  const m = html.match(/href="mailto:([^"?]+)/)
  return m ? m[1] : null
}

/** "158 places · 14 categories": what the guide holds, counted the way the
 *  home's trust line counts it (places in a category the site shows). */
export function aboutCount(places: number, categories: number): string | null {
  if (places === 0 || categories === 0) return null
  return `${places} ${places === 1 ? 'place' : 'places'} · ${categories} ${categories === 1 ? 'category' : 'categories'}`
}
