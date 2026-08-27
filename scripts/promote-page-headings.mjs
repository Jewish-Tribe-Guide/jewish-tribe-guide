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
//   node --env-file=.env.local scripts/promote-page-headings.mjs            # dry run
//   node --env-file=.env.local scripts/promote-page-headings.mjs --apply    # write
//
// Runs against whatever NEXT_PUBLIC_SUPABASE_URL points at, and prints which
// project that is before doing anything.

import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

/** A paragraph is a section title if it's short, has no sentence-ending
 *  punctuation, and isn't already marked up. Deliberately conservative: a
 *  missed heading is a paragraph that stays a paragraph, while a false
 *  positive silently promotes a real sentence, so the dry run exists to be
 *  read rather than trusted. */
function promote(html) {
  const promoted = []
  const out = html.replace(/<p>([\s\S]*?)<\/p>/g, (whole, inner) => {
    const text = inner.replace(/<[^>]+>/g, '').trim()
    const isHeading = text.length > 0 && text.length < 60 && !/[.!?:,;]$/.test(text)
    if (!isHeading) return whole
    promoted.push(text)
    return `<h2>${inner}</h2>`
  })
  return { out, promoted }
}

const supabase = createClient(url, key)
const { data, error } = await supabase.from('page').select('slug,body').order('slug')
if (error) {
  console.error(`Could not read pages: ${error.message}`)
  process.exit(1)
}

console.log(`\nProject: ${url}`)
console.log(APPLY ? 'Mode:    APPLY (writing)\n' : 'Mode:    dry run (pass --apply to write)\n')

let changed = 0
for (const row of data) {
  const { out, promoted } = promote(row.body)
  if (out === row.body) {
    console.log(`  ${row.slug}: nothing to promote`)
    continue
  }
  changed += 1
  console.log(`  ${row.slug}: ${promoted.length} heading(s)`)
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
else console.log('\nDone. The public pages cache for a day — an admin save, or a redeploy, refreshes them.')
