// ── Rich text for the admin-editable static pages (About, Privacy) ───────────
//
// The Pages tab used to be a plain <textarea>: blank line = new paragraph, no
// formatting. It's a WYSIWYG now, which means the body column stores markup
// written by a browser's contenteditable — so everything here exists to make
// that safe and to keep the rows that predate it rendering exactly as before.
//
// Two rules the rest of the app depends on:
//
//   1. Nothing renders a page body without going through `pageBodyToHtml`.
//      It sanitizes on the way out as well as on the way in (the API route
//      sanitizes on save), because a row written before this file existed —
//      or by a future migration, or by hand in the Supabase dashboard — never
//      passed through the save path at all.
//
//   2. The sanitizer is an allowlist, not a blocklist. It emits canonical tags
//      it constructs itself and escapes everything else; there is no path by
//      which an attribute or a tag from the input reaches the output verbatim.
//      Only admins can write this content, so this is defence in depth rather
//      than the primary control — but the blast radius of one compromised
//      admin session would otherwise be stored XSS on a page every visitor
//      loads, which is worth an allowlist.

/** Tags that survive sanitizing, emitted with no attributes (except `a`). */
const ALLOWED = new Set(['p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote'])

/** Tags rewritten to an allowed equivalent rather than dropped. contenteditable
 *  emits `b`/`i` for bold/italic and wraps lines in `div`s; a paste from Word
 *  or a Google Doc brings `strike`, `del`, and heading levels this page has no
 *  business rendering (there is already an `<h1>` — the page title). */
const REMAP: Record<string, string> = {
  b: 'strong',
  i: 'em',
  strike: 's',
  del: 's',
  div: 'p',
  h1: 'h2',
  h4: 'h3',
  h5: 'h3',
  h6: 'h3',
}

/** Tags whose *contents* are dropped along with the tag. Everything else that
 *  isn't allowed is unwrapped instead — a `<span style=…>` around a sentence
 *  should lose the span and keep the sentence, but a `<script>` that lost only
 *  its tags would leave its source visible as body copy. */
const DROP_CONTENT = new Set(['script', 'style', 'title', 'head', 'iframe', 'object', 'embed', 'noscript'])

const VOID = new Set(['br'])

/** Escapes text for a text node, leaving existing entities (`&amp;`, `&rsquo;`)
 *  alone rather than double-escaping them into visible `&amp;amp;`. */
function escapeText(text: string): string {
  return text
    .replace(/&(?!#\d+;|#[xX][0-9a-fA-F]+;|[a-zA-Z][a-zA-Z0-9]*;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;')
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  Tab: '\t',
  NewLine: '\n',
}

/** Decodes entities in an attribute value before it's validated. A browser
 *  resolves `&#106;avascript:alert(1)` to `javascript:alert(1)` when it
 *  follows the link, so the protocol check has to see what the browser will
 *  see, not the literal text. */
function decodeEntities(value: string): string {
  return value.replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return NAMED_ENTITIES[body] ?? whole
  })
}

/** The href schemes a page body may link to. Everything else — `javascript:`,
 *  `data:`, `vbscript:`, an unknown app scheme — yields a link with no href,
 *  so the text survives and the link doesn't. */
function safeHref(raw: string): string | null {
  // Strip whitespace and C0 control characters anywhere in the value, not just
  // at the ends: `java<TAB>script:` and `java<LF>script:` are both live links
  // to a browser, and a check against a merely trimmed value would miss them.
  const value = decodeEntities(raw).replace(/[\u0000-\u0020\u007f]/g, '')
  if (!value) return null
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value
  // Relative links within this same site — the About page pointing at /privacy.
  if (/^[/#]/.test(value) && !value.startsWith('//')) return value
  return null
}

function attrOf(attrs: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs)
  if (!match) return null
  return match[2] ?? match[3] ?? match[4] ?? ''
}

const TAG = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g

/** Rewrites `html` as the allowlisted subset above: known tags are re-emitted
 *  canonically (no attributes, except a validated `href`), unknown tags are
 *  unwrapped, unclosed tags are closed, and stray closing tags are dropped. */
export function sanitizeRichText(html: string): string {
  const out: string[] = []
  const stack: string[] = []
  // Set while inside a DROP_CONTENT element, to the tag being skipped. Nested
  // depth is tracked too, so `<script><script></script></script>` doesn't
  // resume emitting halfway through.
  let skipping: string | null = null
  let skipDepth = 0
  let cursor = 0

  const pushText = (text: string) => {
    if (!skipping && text) out.push(escapeText(text))
  }

  TAG.lastIndex = 0
  for (let match = TAG.exec(html); match; match = TAG.exec(html)) {
    pushText(html.slice(cursor, match.index))
    cursor = match.index + match[0].length

    // A comment — matched only so its contents aren't treated as text.
    if (match[1] === undefined) continue

    const raw = match[1].toLowerCase()
    const closing = match[0][1] === '/'

    if (skipping) {
      if (raw === skipping) skipDepth += closing ? -1 : 1
      if (skipDepth === 0) skipping = null
      continue
    }
    if (!closing && DROP_CONTENT.has(raw)) {
      // A self-closing `<iframe/>` never gets a matching close tag, so left to
      // the skip logic it would swallow the whole rest of the document.
      if (!match[2].trimEnd().endsWith('/')) {
        skipping = raw
        skipDepth = 1
      }
      continue
    }

    const tag = REMAP[raw] ?? raw
    if (!ALLOWED.has(tag)) continue // Unwrap: drop the tag, keep its contents.

    if (VOID.has(tag)) {
      if (!closing) out.push(`<${tag}>`)
      continue
    }

    if (!closing) {
      if (tag === 'a') {
        const href = safeHref(attrOf(match[2], 'href') ?? '')
        // Admin copy links out to other organisations constantly, and opening
        // those in a new tab is what every one of them expects — `noopener` is
        // not optional once `target` is set. A link to this same site is
        // navigation, not a citation, and gets neither: About pointing at
        // /privacy should not strand the visitor with two tabs open.
        const external = href !== null && /^https?:/i.test(href)
        out.push(
          href === null
            ? '<a>'
            : external
              ? `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">`
              : `<a href="${escapeAttr(href)}">`,
        )
      } else {
        out.push(`<${tag}>`)
      }
      stack.push(tag)
      continue
    }

    // A closing tag closes everything opened inside the element it closes, so
    // `<p><em>x</p>` can't leak the `<em>` into the following paragraph. A
    // closer with nothing matching it on the stack is dropped entirely.
    const at = stack.lastIndexOf(tag)
    if (at === -1) continue
    for (let i = stack.length - 1; i >= at; i -= 1) out.push(`</${stack[i]}>`)
    stack.length = at
  }
  pushText(html.slice(cursor))
  for (let i = stack.length - 1; i >= 0; i -= 1) out.push(`</${stack[i]}>`)

  // contenteditable represents "the caret is on an empty line" as a paragraph
  // holding a single <br>. Left in, each one renders as a paragraph carrying
  // the .rich-text paragraph margin on top of the blank line it already is —
  // double spacing the editor never showed. The output is canonical by this
  // point, so matching it with a regex is safe here in a way it would not be
  // against the input.
  return out.join('').replace(/<p>(?:\s|<br>)*<\/p>/g, '')
}

/** Whether `body` is markup (written by the WYSIWYG) rather than the plain
 *  text the Pages editor stored before it existed. Checked against the
 *  allowlist specifically: prose containing "<3" or "a < b" is still prose. */
export function isRichText(body: string): boolean {
  return new RegExp(`<(${[...ALLOWED].join('|')})\\b[^>]*>`, 'i').test(body)
}

/** A legacy plain-text body as markup — blank-line-separated paragraphs, the
 *  exact rule the old textarea and the old renderer both used, so converting
 *  one changes nothing about how it reads. */
export function plainTextToRichText(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeText(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** The one way to turn a stored page body into HTML for rendering. Handles
 *  both eras of content, and sanitizes either way — see rule 1 at the top. */
export function pageBodyToHtml(body: string | null | undefined): string {
  const value = body ?? ''
  return isRichText(value) ? sanitizeRichText(value) : plainTextToRichText(value)
}

// Exported for the test, which asserts against the allowlist itself rather
// than a hand-copied list that could drift from it.
export const ALLOWED_TAGS: readonly string[] = [...ALLOWED]
