import { describe, expect, it } from 'vitest'
import { CATEGORY_TEMPLATES } from './categoryTemplates'
import { categories as seedCategories } from '@/data/categories'
import type { CategoryField } from './categories'

// A choice field that lets visitors type their own answer (allowOther) has
// no use for a catch-all "Other …" option as well. Worse, the catch-all
// files a real certifier under a name that says nothing about who it is.
// That's why "Other Kosher" came out of the Food category's certifications.
// New communities start from these two sources, so they must not bring it
// back.
const sources: Array<[string, Array<{ id: string; fields?: CategoryField[]; detailFields?: CategoryField[] }>]> = [
  ['CATEGORY_TEMPLATES', CATEGORY_TEMPLATES],
  ['src/data/categories.js', seedCategories as never],
]

describe('starter categories', () => {
  for (const [name, list] of sources) {
    it(`${name}: no catch-all "Other" option on a field that lets you type one`, () => {
      const offenders = list.flatMap((c) =>
        (c.fields ?? c.detailFields ?? [])
          .filter((f) => f.type === 'select' && f.allowOther)
          .flatMap((f) => (f.options ?? []).filter((o) => /^other\b/i.test(o.label)).map((o) => `${c.id}.${f.key}: ${o.label}`)),
      )
      expect(offenders).toEqual([])
    })

    it(`${name}: the kosher certification lets you name one that isn't listed`, () => {
      const certs = list.flatMap((c) => (c.fields ?? c.detailFields ?? []).filter((f) => f.key === 'kosherCert'))
      expect(certs.length).toBeGreaterThan(0)
      for (const f of certs) expect(f.allowOther).toBe(true)
    })
  }
})
