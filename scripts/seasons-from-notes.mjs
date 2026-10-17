// Moves "Winter only" / "Summer only" out of a minyan's note and into its
// season (agreed Oct 1).
//
// Shuls wrote their seasons into the note long before minyanim had a season
// field, so the guide can't tell: Mekor Habracha's Friday 7:00 PM ("Summer
// only") and its candle-lighting Mincha ("Winter only") both show every
// Friday of the year. The season field is what lets the guide dim the one
// that doesn't apply (lib/season.ts). The rest of the note stays: "Winter
// only- following Kiddush" becomes winter, "following Kiddush".
//
// "Update their times" does the same for a shul whenever its times are
// updated (scheduleUpdate.ts seasonFromNotes); this does every shul at once.
//
//   node --env-file=.env.local scripts/seasons-from-notes.mjs                   # dry run, dev/test
//   node --env-file=.env.local scripts/seasons-from-notes.mjs --apply           # write, dev/test
//   node --env-file=.env.local scripts/seasons-from-notes.mjs --prod            # dry run, production
//   node --env-file=.env.local scripts/seasons-from-notes.mjs --prod --apply    # write, production
//
// Production only when asked for, from PROD_SUPABASE_URL /
// PROD_SUPABASE_SERVICE_ROLE_KEY, as promote-page-headings.mjs does. It
// prints which project it is about to touch, and writes nothing without
// --apply. The dry run lists every minyan it would change; read it.

import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

/** Deliberately identical to SEASON_NOTE in src/lib/scheduleUpdate.ts: a
 *  .mjs script can't import a .ts module, so seasonsFromNotes.test.ts holds
 *  the two to the same answers. */
const SEASON_NOTE = /\b(winter|summer)\s+only\b[\s,;:.–—-]*/i

/** One minyan with its season out of its note, or null when there's
 *  nothing to move (no season in the note, or one already set that the
 *  note disagrees with). */
export function fromNotes(m) {
  const hit = typeof m?.notes === 'string' ? m.notes.match(SEASON_NOTE) : null
  if (!hit) return null
  const season = hit[1].toLowerCase()
  if (m.season && m.season !== season) return null
  const notes = m.notes.replace(SEASON_NOTE, '').replace(/^[\s,;:.–—-]+|[\s,;:.–—-]+$/g, '').trim()
  const rest = { ...m }
  delete rest.notes
  return { ...rest, season, ...(notes ? { notes } : {}) }
}

const isMinyanim = (v) => Array.isArray(v) && v.length > 0 && v.every((e) => e && typeof e === 'object' && 'tefillah' in e && 'days' in e && 'time' in e)

/** A listing's details with every minyan's season moved, and what moved. */
export function fixDetails(details) {
  const moved = []
  const next = { ...details }
  for (const [key, value] of Object.entries(details ?? {})) {
    if (!isMinyanim(value)) continue
    next[key] = value.map((m) => {
      const fixed = fromNotes(m)
      if (!fixed) return m
      moved.push({ key, before: m, after: fixed })
      return fixed
    })
  }
  return { details: next, moved }
}

async function main() {
  const APPLY = process.argv.includes('--apply')
  const PROD = process.argv.includes('--prod')

  const url = PROD ? process.env.PROD_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = PROD ? process.env.PROD_SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(PROD ? 'Needs PROD_SUPABASE_URL and PROD_SUPABASE_SERVICE_ROLE_KEY.' : 'Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }

  const supabase = createClient(url, key)
  const { data, error } = await supabase.from('resource').select('id,name,details').order('name')
  if (error) {
    console.error(`Could not read listings: ${error.message}`)
    process.exit(1)
  }

  console.log(`\nTarget:  ${PROD ? 'PRODUCTION' : 'dev/test'}`)
  console.log(`Project: ${url}`)
  console.log(APPLY ? 'Mode:    APPLY (writing)\n' : 'Mode:    dry run (pass --apply to write)\n')

  let changed = 0
  for (const row of data) {
    const { details, moved } = fixDetails(row.details)
    if (moved.length === 0) continue
    changed += moved.length
    console.log(`  ${row.name}`)
    for (const { before, after } of moved) {
      console.log(`      ${before.tefillah} · ${before.days.join(',')} · ${before.time}: note “${before.notes}” → season ${after.season}${after.notes ? `, note “${after.notes}”` : ', no note'}`)
    }
    if (APPLY) {
      const { error: e } = await supabase.from('resource').update({ details }).eq('id', row.id)
      if (e) {
        console.error(`      could not save: ${e.message}`)
        process.exit(1)
      }
      console.log('      saved')
    }
  }

  if (!changed) console.log('Nothing to do.')
  else if (!APPLY) console.log(`\n${changed} minyanim. Read the list above, then re-run with --apply.`)
  else {
    console.log('\nDone — but the running site does not know yet.')
    console.log('It caches its content, and this wrote straight to the database, so the')
    console.log('listings keep showing the old notes for up to a day. Clear it with either:')
    console.log('  • a redeploy (a build regenerates everything), or')
    console.log('  • POST /api/admin/revalidate with an admin token')
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
