// Where the seed's photos are stored: they're uploads in another project's
// storage, so the app's image rules have to be told that host, or the home
// page's image budget fails on full-size originals (imageHosts.ts). Read
// from the seed itself, so a new seed brings its own.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The one storage host the seed's photos are on. */
export function seedStorageUrl(dir = 'supabase/seed/tables') {
  const text = readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf-8')).join('\n')
  const hosts = [...new Set(text.match(/https:\/\/[a-z0-9]+\.supabase\.co(?=\/storage\/)/g) ?? [])]
  if (hosts.length !== 1) throw new Error(`Expected the seed's photos on one host, found ${hosts.length}: ${hosts.join(', ')}`)
  return hosts[0]
}
