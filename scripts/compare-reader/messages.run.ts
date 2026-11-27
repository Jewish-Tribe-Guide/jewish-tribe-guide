// The "+ Add" box's reader at different thinking levels, on posts people
// really sent (Nov 26, docs/add-rethink.md: "the wait comes at the worst
// moment"). Every read ran at the model's default level, which takes a
// while; the question reader answers at "none" in about a second.
//
// The posts are the box's own, as kept on the submissions they became
// (payload.source, from "a message" or "a photo"), on live and dev. Each is
// read against live's listings at each level, the default twice: two
// default reads that disagree say how much any difference is the model
// varying rather than the level. Every lower level is compared with the
// first default read:
//   same         the same changes (places, items, fields and their values)
//   same places  the same kinds of change to the same places, details differ
//   different    anything else
//
// Reads live and dev (read-only) and calls OpenAI with OPENAI_API_KEY, so
// it's not part of `npm test`:
//   REPORT_DIR=<somewhere private> npx vitest run --config scripts/compare-reader/vitest.config.mts messages
// The report quotes the posts, so keep it out of the repository.
// LEVELS (default "default,default,low,none") and LIMIT change what runs.

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from 'vitest'
import type { CategoryConfig } from '@/lib/categories'
import { buildCatalog, readMessage, type MessageReadResult, type MessageSource, type Proposal } from '@/lib/messageReader'
import { DEFAULT_READER_MODEL } from '@/lib/readQuestion'
import type { DirectoryResource } from '@/types'

const env = Object.fromEntries(
  fs
    .readFileSync(path.resolve('.env.local'), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
)

const LEVELS = (process.env.LEVELS || 'default,default,low,none').split(',').map((l) => l.trim())
const effortOf = (level: string) => (level === 'default' ? null : level)

/** A proposal as what it would change, without the wording around it. */
function change(p: Proposal): { place: string; detail: string } {
  const sorted = (xs: string[]) => [...xs].sort().join(', ')
  switch (p.kind) {
    case 'items':
      return { place: `items ${p.listingId ?? p.asWritten}`, detail: sorted(p.items.map((i) => `${i.name}/${i.availability}`)) }
    case 'fields':
      return { place: `fields ${p.listingId ?? p.asWritten}`, detail: sorted(p.changes.map((c) => `${c.key}=${JSON.stringify(c.value ?? c.hours ?? null)}`)) }
    case 'new_place':
      return { place: `new ${p.category} ${p.place.name.toLowerCase()}`, detail: sorted(p.items.map((i) => i.name)) + ' ' + JSON.stringify({ ...p.place, notes: null }) }
    case 'times':
      return { place: `times ${p.listingId}`, detail: '' }
    case 'ask_others':
      return { place: `ask ${p.listingId}`, detail: '' }
    case 'menu':
      return { place: `menu ${p.listingId ?? p.asWritten}`, detail: p.url ?? '' }
    case 'not_update':
      return { place: 'not an update', detail: '' }
  }
}
const places = (r: MessageReadResult) => r.proposals.map((p) => change(p).place).sort().join(' | ')
const whole = (r: MessageReadResult) =>
  r.proposals
    .map((p) => {
      const c = change(p)
      return `${c.place}: ${c.detail}`
    })
    .sort()
    .join(' | ')
function agree(a: MessageReadResult, b: MessageReadResult): 'same' | 'same places' | 'different' {
  if (whole(a) === whole(b)) return 'same'
  return places(a) === places(b) ? 'same places' : 'different'
}

test('the box’s reader at each thinking level, on real posts', { timeout: 3_600_000 }, async () => {
  expect(env.OPENAI_API_KEY, 'OPENAI_API_KEY in .env.local').toBeTruthy()
  const live = createClient(env.PROD_SUPABASE_URL, env.PROD_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const dev = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  // The posts: what the box was given, each once.
  type Kept = { from?: string; original?: string; photoUrl?: string }
  const posts = new Map<string, { text: string; photoUrl: string | null }>()
  for (const db of [live, dev]) {
    const { data, error } = await db
      .from('submission')
      .select('source:payload->source')
      .eq('community_id', 'philly')
      .in('payload->source->>from', ['a message', 'a photo'])
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    for (const { source } of data as { source: Kept }[]) {
      const text = source.original ?? ''
      const key = text || source.photoUrl || ''
      if (key && !posts.has(key)) posts.set(key, { text, photoUrl: source.photoUrl ?? null })
    }
  }

  const [{ data: catRows }, { data: rows }] = await Promise.all([
    live.from('category').select('*').eq('community_id', 'philly'),
    live.from('resource').select('*').eq('status', 'approved').eq('community_id', 'philly'),
  ])
  const cats: CategoryConfig[] = (catRows ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    pluralLabel: r.plural_label,
    icon: r.icon,
    description: r.description ?? '',
    detailFields: r.fields ?? [],
    kind: r.kind,
    hasAddress: r.has_address !== false,
    active: r.active,
  }))
  const listings: DirectoryResource[] = (rows ?? []).map((r) => ({
    id: r.id,
    category: r.category,
    name: r.name,
    anchorId: r.anchor_id,
    distance: r.distance ?? 0,
    address: r.address ?? '',
    phone: r.phone ?? undefined,
    ...r.details,
  }))
  const catalog = buildCatalog(listings, cats.filter((c) => c.active !== false))

  const list = [...posts.values()].slice(0, Number(process.env.LIMIT) || undefined)
  const ms: Record<string, number[]> = Object.fromEntries(LEVELS.map((l, i) => [`${l}#${i}`, []]))
  const tally: Record<string, Record<string, number>> = {}
  const out: string[] = []
  for (const [n, post] of list.entries()) {
    const source: MessageSource = { text: post.text, images: [] }
    if (post.photoUrl) {
      const res = await fetch(post.photoUrl)
      if (!res.ok) continue
      source.images.push({ mime: res.headers.get('content-type') ?? 'image/jpeg', b64: Buffer.from(await res.arrayBuffer()).toString('base64') })
    }
    const reads: (MessageReadResult | Error)[] = []
    for (const [i, level] of LEVELS.entries()) {
      try {
        const r = await readMessage(source, catalog, { apiKey: env.OPENAI_API_KEY, communityName: 'Philadelphia', model: process.env.READER_MODEL || DEFAULT_READER_MODEL, effort: effortOf(level) })
        ms[`${level}#${i}`].push(r.ms)
        reads.push(r)
      } catch (e) {
        reads.push(e as Error)
      }
    }
    const base = reads[0]
    out.push(`## Post ${n + 1}${post.photoUrl ? ' (photo)' : ''}`, '', '> ' + (post.text || post.photoUrl || '').slice(0, 600).replace(/\n+/g, '\n> '), '')
    for (const [i, r] of reads.entries()) {
      const label = `${LEVELS[i]}#${i}`
      if (r instanceof Error) {
        out.push(`- **${label}**: ERROR ${r.message}`)
        continue
      }
      const verdict = i === 0 || base instanceof Error ? 'base' : agree(base, r)
      if (i > 0) ((tally[label] ??= { same: 0, 'same places': 0, different: 0, base: 0 })[verdict] as number)++
      out.push(`- **${label}** (${r.ms} ms, ${verdict}): ${whole(r) || '(nothing)'}`)
    }
    out.push('')
  }

  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length ? s[Math.floor(s.length / 2)] : 0
  }
  const p90 = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] : 0
  }
  const report = [
    `# The box's reader at each thinking level (${process.env.READER_MODEL || DEFAULT_READER_MODEL})`,
    '',
    `${list.length} posts people sent through the box, read against live's ${listings.length} listings.`,
    '',
    '| Level | Median | 90th percentile | Agrees with the first default read |',
    '|---|---|---|---|',
    ...LEVELS.map((l, i) => {
      const t = tally[`${l}#${i}`]
      const agreeText = i === 0 ? '(the base)' : t ? `${t.same} same, ${t['same places']} same places, ${t.different} different` : ''
      return `| ${l} (#${i}) | ${median(ms[`${l}#${i}`])} ms | ${p90(ms[`${l}#${i}`])} ms | ${agreeText} |`
    }),
    '',
    ...out,
  ].join('\n')
  const file = path.join(process.env.REPORT_DIR || '.', 'message-reader-levels.md')
  fs.writeFileSync(file, report)
  console.log(report.split('\n').slice(0, 12).join('\n'))
  console.log(`Written to ${file}`)
})
