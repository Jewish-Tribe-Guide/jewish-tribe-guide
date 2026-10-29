import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The Gmail script (scripts/newsletter-apps-script.js) as the Newsletters
// page hands it out: the site, the community and its own key filled in, so
// setting it up is copy, paste, run. The file is the one copy of the script;
// next.config.ts traces it into the admin route that reads it.

export type ScriptFor = { site: string; community: string; key: string }

const quoted = (v: string) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/** `source` with its SITE, COMMUNITY and KEY lines set. Throws if one is
 *  missing: a copy that quietly kept Philly's would post into Philly. */
export function fillNewsletterScript(source: string, { site, community, key }: ScriptFor): string {
  let filled = source
  for (const [name, value] of [
    ['SITE', site.replace(/\/$/, '')],
    ['COMMUNITY', community],
    ['KEY', key],
  ] as const) {
    const line = new RegExp(`^var ${name} = '[^'\\n]*'$`, 'm')
    if (!line.test(filled)) throw new Error(`The newsletter script has no ${name} line to fill in.`)
    filled = filled.replace(line, () => `var ${name} = ${quoted(value)}`)
  }
  return filled
}

export function readNewsletterScript(): string {
  return readFileSync(join(process.cwd(), 'scripts', 'newsletter-apps-script.js'), 'utf8')
}
