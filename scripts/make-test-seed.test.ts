import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMMUNITIES, scrubEmails, seedFrom } from './make-test-seed.mjs'

describe('scrubEmails', () => {
  it('replaces every address, at any depth, the same one the same way', () => {
    const out = scrubEmails({ a: 'Call Jo@Mail.com', b: [{ c: 'jo@mail.com or x@y.org' }], n: 3 })
    expect(out).toEqual({ a: 'Call person1@example.test', b: [{ c: 'person1@example.test or person2@example.test' }], n: 3 })
  })
})

describe('seedFrom', () => {
  const tables = {
    community: [
      { slug: 'philly', admin_emails: ['real@gmail.com'], preview_token: 'secret' },
      { slug: 'e2e-delete-1', admin_emails: [] },
    ],
    category: [
      { community_id: 'philly', id: 'grocery' },
      { community_id: 'philly', id: 'integration-test-abc' },
      { community_id: 'e2e-delete-1', id: 'eruv' },
    ],
    resource: [
      { id: 'r1', community_id: 'philly', category: 'grocery', name: 'Market', submitted_by: { email: 'a@b.com' } },
      { id: 'r2', community_id: 'philly', category: 'integration-test-abc', name: 'Fixture' },
      { id: 'r3', community_id: 'philly', category: 'grocery', name: 'ZZ Found try' },
    ],
    watch: [
      { community_id: 'philly', resource_id: 'r1' },
      { community_id: 'philly', resource_id: 'r3' },
    ],
    form: [
      { community_id: 'philly', id: 'volunteer' },
      { community_id: 'philly', id: 'e2e-test-form' },
    ],
    content_stamp: [{ id: 'all' }, { id: 'c:philly' }, { id: 'c:e2e-writes' }],
  }
  const seed = seedFrom(tables)

  it('keeps the real communities and their content, nothing of tests', () => {
    expect(seed.community.map((c: { slug: string }) => c.slug)).toEqual(['philly'])
    expect(seed.category.map((c: { id: string }) => c.id)).toEqual(['grocery'])
    expect(seed.resource.map((r: { id: string }) => r.id)).toEqual(['r1'])
    expect(seed.watch).toEqual([{ community_id: 'philly', resource_id: 'r1' }])
    expect(seed.form.map((f: { id: string }) => f.id)).toEqual(['volunteer'])
    expect(seed.content_stamp.map((s: { id: string }) => s.id)).toEqual(['all', 'c:philly'])
  })

  it('leaves no real email, submitter or preview token', () => {
    expect(JSON.stringify(seed)).not.toMatch(/gmail|a@b\.com|secret/)
    expect(seed.resource[0].submitted_by).toBeNull()
    expect(seed.community[0].preview_token).toBe('00000000-0000-4000-8000-000000000001')
  })
})

// The committed seed is published with the repo. Whatever made it, it must
// hold no real address and no test leftover.
describe('supabase/seed as committed', () => {
  const dir = 'supabase/seed/tables'
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))

  it('is there', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  for (const file of files) {
    it(`${file} holds only made-up emails and no test rows`, () => {
      const text = readFileSync(join(dir, file), 'utf8')
      const emails = text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? []
      expect(emails.filter((e) => !e.endsWith('@example.test'))).toEqual([])
      expect(text).not.toMatch(/Integration Test|integration-test-|vote-test-|"e2e-|ZZ Found/)
      for (const row of JSON.parse(text) as Array<{ community_id?: string | null }>) {
        if (row.community_id != null) expect(COMMUNITIES).toContain(row.community_id)
      }
    })
  }
})
