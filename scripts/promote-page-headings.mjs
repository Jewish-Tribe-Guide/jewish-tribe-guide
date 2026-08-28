// Promotes the section titles in a static page's body from paragraphs to <h2>.
//
// The About and Privacy bodies were written before the Pages tab had a
// rich-text editor, so their section titles ("Browsing the directory",
// "Location", …) are stored as ordinary paragraphs. They render identically to
// the text around them, which is most of why those pages read as one slab — no
// amount of CSS fixes it, because there is no heading in the markup to style.
//
// This is a one-time content migration, not a renderer change. Doing it in the
// render path was the alternative and is worse: it would keep re-guessing on
// every request, it would fight an admin who deliberately writes a short
// paragraph, and the Pages editor would still show the title as body text
// while the public page showed a heading. Fixing the stored markup means the
// editor and the page agree, and the guess happens once, reviewably.
//
// The words are never touched — only the tag around them.
//
//   node --env-file=.env.local scripts/promote-page-headings.mjs                   # dry run, dev/test
//   node --env-file=.env.local scripts/promote-page-headings.mjs --apply           # write, dev/test
//   node --env-file=.env.local scripts/promote-page-headings.mjs --prod            # dry run, production
//   node --env-file=.env.local scripts/promote-page-headings.mjs --prod --apply    # write, production
//
// Defaults to NEXT_PUBLIC_SUPABASE_URL (whatever local dev points at) and takes
// production only when asked for explicitly, from PROD_SUPABASE_URL /
// PROD_SUPABASE_SERVICE_ROLE_KEY — the same pair sync-dev-from-prod.mjs uses.
// A flag rather than "override the env vars by hand", because the hand-override
// version is one shell-history recall away from rewriting the wrong database's
// content. Either way it prints which project it is about to touch, and writes
// nothing without --apply.
//
// There is no undo. The dry run prints every promotion; read it.

import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

/** Is this a section title? Short, no sentence-ending punctuation.
 *  Deliberately conservative: a missed heading stays a paragraph, while a false
 *  positive silently promotes a real sentence, so the dry run exists to be read
 *  rather than trusted. */
const isHeading = (text) => text.length > 0 && text.length < 60 && !/[.!?:,;]$/.test(text)

/** Escapes a text node, leaving existing entities alone rather than
 *  double-escaping them. Deliberately identical to escapeText in
 *  src/lib/richText.ts — the script can't import a .ts module, so
 *  scripts/promotePageHeadings.test.ts asserts the two agree on the plain-text
 *  path rather than trusting that they look similar. */
export function escapeText(text) {
  return text
    .replace(/&(?!#\d+;|#[xX][0-9a-fA-F]+;|[a-zA-Z][a-zA-Z0-9]*;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Handles both eras of stored body.
 *
 *  Rows written through the Pages tab's editor hold markup, and their section
 *  titles are <p>. Rows that predate the editor — which is what production
 *  still has — are plain text with blank lines between paragraphs, and contain
 *  no tags at all. The first version of this script only knew about the markup
 *  case, so against production it matched nothing and printed "nothing to
 *  promote", which reads exactly like success. A migration that cannot see its
 *  input has to fail loudly, not quietly agree.
 *
 *  Converting plain text to markup is the same transformation
 *  plainTextToRichText performs on every render, so this changes how the body
 *  is STORED without changing how it reads. */
export function promote(body) {
  const promoted = []

  if (/<(p|h2|h3|ul|ol|li|blockquote)\b/i.test(body)) {
    const out = body.replace(/<p>([\s\S]*?)<\/p>/g, (whole, inner) => {
      const text = inner.replace(/<[^>]+>/g, '').trim()
      if (!isHeading(text)) return whole
      promoted.push(text)
      return `<h2>${inner}</h2>`
    })
    return { out, promoted }
  }

  const out = body
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const escaped = escapeText(chunk).replace(/\n/g, '<br>')
      if (!isHeading(chunk)) return `<p>${escaped}</p>`
      promoted.push(chunk)
      return `<h2>${escaped}</h2>`
    })
    .join('')
  return { out, promoted }
}

// Everything below runs only when this file is executed directly. Importing it
// — which scripts/promotePageHeadings.test.ts does, to test `promote` against
// the renderer it duplicates — must not read a database or exit the process.
async function main() {
  const APPLY = process.argv.includes('--apply')
  const PROD = process.argv.includes('--prod')

  const url = PROD ? process.env.PROD_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = PROD ? process.env.PROD_SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(
      PROD
        ? 'Needs PROD_SUPABASE_URL and PROD_SUPABASE_SERVICE_ROLE_KEY.'
        : 'Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    )
    process.exit(1)
  }

  const supabase = createClient(url, key)
  const { data, error } = await supabase.from('page').select('slug,body').order('slug')
  if (error) {
    console.error(`Could not read pages: ${error.message}`)
    process.exit(1)
  }

  console.log(`\nTarget:  ${PROD ? 'PRODUCTION' : 'dev/test'}`)
  console.log(`Project: ${url}`)
  console.log(APPLY ? 'Mode:    APPLY (writing)\n' : 'Mode:    dry run (pass --apply to write)\n')

  let changed = 0
  for (const row of data) {
    const { out, promoted } = promote(row.body)
    if (out === row.body) {
      console.log(`  ${row.slug}: nothing to promote`)
      continue
    }
    changed += 1
    // A plain-text row changes shape even when nothing is promoted — it comes
    // out as markup. Saying "0 heading(s)" and nothing else would understate
    // what is about to be written, which is not a thing to be coy about in a
    // script with no undo.
    const converted = !/<(p|h2|h3|ul|ol|li|blockquote)\b/i.test(row.body)
    const what = [
      promoted.length ? `${promoted.length} heading(s)` : null,
      converted ? 'plain text → markup' : null,
    ]
      .filter(Boolean)
      .join(', ')
    console.log(`  ${row.slug}: ${what}`)
    for (const t of promoted) console.log(`      → ${t}`)
    if (APPLY) {
      const { error: writeError } = await supabase
        .from('page')
        .update({ body: out, updated_at: new Date().toISOString() })
        .eq('slug', row.slug)
      if (writeError) {
        console.error(`      FAILED: ${writeError.message}`)
        process.exit(1)
      }
      console.log('      saved')
    }
  }

  if (!changed) console.log('\nNothing to do.')
  else if (!APPLY) console.log('\nRead the list above, then re-run with --apply.')
  else {
    console.log('\nDone — but the running site does not know yet.')
    console.log('It caches its content, and this wrote straight to the database, so the')
    console.log('pages keep showing the old text for up to a day. Clear it with either:')
    console.log('  • a redeploy (a build regenerates everything), or')
    console.log('  • POST /api/admin/revalidate with an admin token')
  }

}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
