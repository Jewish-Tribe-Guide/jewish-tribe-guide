import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The public key reaches no table (migration 103, Nov 20). The anon key is
// in every visitor's browser; a policy that lets it (or a signed-in admin's
// browser) read a table goes round the site's own routes and their checks.
// One did: `community` handed out every admin's email and every hidden
// community's preview token. Every read and write here is a server route
// on the service-role key, so no table needs one.
//
// Replays every migration's create/drop policy in order and fails on any
// policy still standing that isn't for service_role.

const DIR = 'supabase/migrations'

function standingPolicies(files: string[]): Map<string, string> {
  const standing = new Map<string, string>()
  for (const file of files) {
    const sql = readFileSync(`${DIR}/${file}`, 'utf-8').replace(/--[^\n]*/g, '')
    for (const stmt of sql.split(';')) {
      const create = stmt.match(/create\s+policy\s+"([^"]+)"\s+on\s+(?:public\.)?(\w+)/i)
      const drop = stmt.match(/drop\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+(?:public\.)?(\w+)/i)
      if (create) standing.set(`${create[2]}: ${create[1]}`, stmt.trim())
      else if (drop) standing.delete(`${drop[2]}: ${drop[1]}`)
    }
  }
  return standing
}

const publicOnes = (standing: Map<string, string>) =>
  [...standing].filter(([, stmt]) => !/\bto\s+service_role\b/i.test(stmt)).map(([name]) => name)

describe('no table is open to the public key', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()

  it('finds the policies at all', () => {
    expect(standingPolicies(files.slice(0, 2)).size).toBeGreaterThan(0)
  })

  it('every standing policy is for service_role', () => {
    expect(publicOnes(standingPolicies(files))).toEqual([])
  })
})
