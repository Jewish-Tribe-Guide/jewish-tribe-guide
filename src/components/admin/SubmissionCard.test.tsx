// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { CategoryField, FieldType } from '@/lib/categories'
import { formatAnchorRule, type Minyan } from '@/lib/davening'
import type { EnrichedSubmission, ResourceRow } from '@/types'
import { SubmissionCard } from './SubmissionCard'
import { makeCategory } from '@/test/providerFixtures'
import { SYNC_INTERNAL_FIELDS, SHOWN_WHEN_CONFIGURED } from '@/lib/syncFields'

afterEach(() => cleanup())

// ─────────────────────────────────────────────────────────────────────────────
// The moderation queue's one job is showing a moderator exactly what an edit
// proposes. Anything it renders identically before and after is a change they
// approve blind — which is not a cosmetic bug, it's the feature failing
// silently, and it already happened: minyanim were summarised as
// "5 minyanim: Shacharis, Mincha", so changing a time, a day, a note or the
// season produced a byte-identical string and the diff said "unchanged".
//
// Both suites below are keyed on a `Record` of a real type union, so they stop
// compiling when someone adds a field type or a minyan property without
// deciding how a moderator should see it. That's deliberate: a test that has
// to be remembered is a test that goes stale.
// ─────────────────────────────────────────────────────────────────────────────

/** A before/after pair per field type, differing in exactly that field. */
const SAMPLES: Record<FieldType, { field: Omit<CategoryField, 'label'>; before: unknown; after: unknown }> = {
  text: { field: { key: 'f', type: 'text' }, before: 'Old name', after: 'New name' },
  textarea: { field: { key: 'f', type: 'textarea' }, before: 'Old blurb', after: 'New blurb' },
  tel: { field: { key: 'f', type: 'tel' }, before: '215-555-0100', after: '215-555-0199' },
  url: { field: { key: 'f', type: 'url' }, before: 'https://a.example', after: 'https://b.example' },
  number: { field: { key: 'f', type: 'number' }, before: 3, after: 4 },
  boolean: { field: { key: 'f', type: 'boolean' }, before: false, after: true },
  image: { field: { key: 'f', type: 'image' }, before: 'https://img/a.jpg', after: 'https://img/b.jpg' },
  select: {
    field: { key: 'f', type: 'select', options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }] },
    before: 'a',
    after: 'b',
  },
  tags: { field: { key: 'f', type: 'tags' }, before: ['Dairy'], after: ['Dairy', 'Pareve'] },
  hours: {
    field: { key: 'f', type: 'hours' },
    before: { mon: { open: '09:00', close: '17:00' } },
    after: { mon: { open: '09:00', close: '18:00' } },
  },
  minyanim: {
    field: { key: 'f', type: 'minyanim' },
    before: [{ id: 'm', tefillah: 'shacharis', days: ['mon'], time: '7:00am' }],
    after: [{ id: 'm', tefillah: 'shacharis', days: ['mon'], time: '7:30am' }],
  },
}

function renderDiff(field: Omit<CategoryField, 'label'>, before: unknown, after: unknown) {
  const category = makeCategory({
    id: 'grocery',
    detailFields: [{ ...field, label: 'The Field' } as CategoryField],
  })
  const current = {
    id: 'r1',
    category: 'grocery',
    name: 'Place',
    details: { [field.key]: before },
  } as unknown as ResourceRow
  const submission = {
    id: 's1',
    operation: 'update',
    target_type: 'listing',
    target_id: 'r1',
    payload: { category: 'grocery', name: 'Place', details: { [field.key]: after } },
    note: null,
    status: 'pending',
    submitted_by: null,
    created_at: new Date().toISOString(),
    reviewed_at: null,
    current,
  } as unknown as EnrichedSubmission

  return render(
    <SubmissionCard submission={submission} categoriesById={new Map([['grocery', category]])} />,
  )
}

/** The rendered before → after text for the one field under test. */
function diffText(): string {
  const dt = screen.getByText('The Field')
  return dt.parentElement!.textContent ?? ''
}

describe('moderation queue — every field type is legible and diffable', () => {
  for (const [type, { field, before, after }] of Object.entries(SAMPLES) as [FieldType, (typeof SAMPLES)[FieldType]][]) {
    it(`shows a ${type} change as a change`, () => {
      renderDiff(field, before, after)
      const text = diffText()

      // The whole point: an edit must not render identically to what it replaces.
      expect(text).toContain('→')
      // And it must be readable. A moderator learns nothing from "[object
      // Object]" — the failure mode any new object-valued type would hit.
      expect(text).not.toContain('[object Object]')
      expect(text.replace('The Field', '').trim().length).toBeGreaterThan(0)
    })

    it(`shows an unchanged ${type} field as unchanged`, () => {
      renderDiff(field, before, before)
      // No arrow means the card isn't crying wolf on fields nobody touched —
      // noise here is what trains a moderator to skim past real changes.
      expect(diffText()).not.toContain('→')
    })
  }
})

// Every property of a Minyan has to be classified. Adding one to the type
// without touching this map is a compile error, which is the point: `season`
// was added to Minyan and the queue went on rendering the old count-only
// summary, so a seasonal edit was invisible to whoever approved it.
const MINYAN_FIELD_VISIBILITY: Record<keyof Minyan, 'shown' | 'deliberately-hidden'> = {
  tefillah: 'shown',
  days: 'shown',
  time: 'shown',
  notes: 'shown',
  season: 'shown',
  // Bookkeeping, not content — a moderator has no use for it.
  id: 'deliberately-hidden',
  // `time` is generated from these by formatAnchorRule and kept in sync by the
  // intake form, so it already reads "15 min before Sunset". Asserted below.
  anchor: 'deliberately-hidden',
  offsetMinutes: 'deliberately-hidden',
  // Same deal: formatAnchorRule folds the bounds into `time` as "(between
  // 5:00 PM and 7:00 PM)", so a moderator reads the window in the line they
  // were already reading. Asserted below — a bound edited from 7:00 to 7:15
  // must not approve blind.
  notBefore: 'deliberately-hidden',
  notAfter: 'deliberately-hidden',
}

const MINYAN_CHANGES: Record<string, [Partial<Minyan>, Partial<Minyan>]> = {
  tefillah: [{ tefillah: 'shacharis' }, { tefillah: 'mincha' }],
  days: [{ days: ['mon'] }, { days: ['mon', 'thu'] }],
  time: [{ time: '7:00am' }, { time: '7:30am' }],
  notes: [{ notes: 'Upstairs' }, { notes: 'Downstairs' }],
  season: [{ season: 'winter' }, { season: 'summer' }],
}

describe('moderation queue — every minyan property a moderator should see', () => {
  const base: Minyan = { id: 'm1', tefillah: 'shacharis', days: ['mon'], time: '7:00am' }
  const field = { key: 'davening', type: 'minyanim' as const }

  for (const [key, visibility] of Object.entries(MINYAN_FIELD_VISIBILITY)) {
    if (visibility !== 'shown') continue
    it(`surfaces a change to ${key}`, () => {
      const [before, after] = MINYAN_CHANGES[key]
      expect(before, `add a MINYAN_CHANGES entry for "${key}"`).toBeDefined()
      renderDiff(field, [{ ...base, ...before }], [{ ...base, ...after }])
      expect(diffText()).toContain('→')
    })
  }

  it('reflects an anchor change through the generated time text', () => {
    // anchor/offsetMinutes are hidden on the understanding that `time` mirrors
    // them. If that ever stops being true, this is where it shows up.
    renderDiff(
      field,
      [{ ...base, time: '15 min before Sunset', anchor: 'sunset' as const, offsetMinutes: -15 }],
      [{ ...base, time: '30 min before Sunset', anchor: 'sunset' as const, offsetMinutes: -30 }],
    )
    expect(diffText()).toContain('→')
  })

  it('reflects a bounds change through the generated time text', () => {
    const rule = { anchor: 'candle_lighting' as const, offsetMinutes: 0, notBefore: '17:00' }
    renderDiff(
      field,
      [{ ...base, ...rule, notAfter: '19:00', time: formatAnchorRule('candle_lighting', 0, { notBefore: '17:00', notAfter: '19:00' }) }],
      [{ ...base, ...rule, notAfter: '19:15', time: formatAnchorRule('candle_lighting', 0, { notBefore: '17:00', notAfter: '19:15' }) }],
    )
    expect(diffText()).toContain('→')
    expect(diffText()).toContain('7:15 PM')
  })

  it('renders one line per minyan rather than a count', () => {
    renderDiff(
      field,
      [base],
      [base, { id: 'm2', tefillah: 'mincha', days: ['sat'], time: '12:20pm', season: 'winter' as const }],
    )
    const text = diffText()
    expect(text).toContain('12:20pm')
    expect(text).toContain('Winter only')
    // The summary this replaced. It said "2 minyanim: Shacharis, Mincha" and
    // nothing else, which is how a time change came to read as no change.
    expect(text).not.toMatch(/\d+ minyanim:/)
  })
})

// The read-only history view (approved/rejected — no onModerate prop) is
// what the Metrics tiles link to, specifically so "who approved/rejected
// this" has an answer now that a community can have several admins.
describe('read-only history card — who reviewed it', () => {
  function renderHistoryCard(overrides: Partial<EnrichedSubmission> = {}) {
    const submission = {
      id: 's1',
      operation: 'create',
      target_type: 'listing',
      target_id: null,
      payload: { category: 'grocery', name: 'Place', address: '', phone: '', details: {} },
      note: null,
      status: 'approved',
      submitted_by: null,
      created_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
      reviewed_by: null,
      ...overrides,
    } as unknown as EnrichedSubmission
    return render(<SubmissionCard submission={submission} categoriesById={new Map()} />)
  }

  it('shows who reviewed it when reviewed_by is set', () => {
    renderHistoryCard({ reviewed_by: 'jane@example.com' })
    expect(screen.getByText(/by jane@example\.com/)).toBeInTheDocument()
  })

  it('shows nothing extra for a submission decided before reviewed_by existed', () => {
    renderHistoryCard({ reviewed_by: null })
    expect(screen.queryByText(/^by /)).not.toBeInTheDocument()
  })

  // How long something's been sitting matters most in the live moderation
  // queue (a reviewer deciding what's overdue), but this line isn't gated on
  // onModerate — it's the same "when was this submitted" fact either way,
  // so the history view gets it too rather than needing a second code path.
  it('shows when it was submitted, separately from when it was reviewed', () => {
    renderHistoryCard({ created_at: '2026-01-05T14:30:00Z', reviewed_at: '2026-01-06T09:00:00Z' })
    expect(screen.getByText(/Submitted Jan 5, 2026/)).toBeInTheDocument()
  })
})

// Real bug, seen by a moderator: a davening-times edit rendered
// "businessStatusBefore UNKNOWN → —" and "businessStatusChangedAt
// 2026-08-31T… → —" under the minyanim, as though the submitter had proposed
// something about Google's sync bookkeeping. The card kept its own hand-listed
// skip set, which knew `businessStatus` but not the two fields beside it.
//
// Derived from SYNC_INTERNAL_FIELDS now, and asserted from it too — a new
// bookkeeping key added there must never need a second edit here to stay
// hidden, because the second edit is the one that gets forgotten.
describe('the diff hides sync bookkeeping, all of it', () => {
  for (const key of SYNC_INTERNAL_FIELDS.filter((k) => k !== SHOWN_WHEN_CONFIGURED)) {
    it(`never shows ${key}`, () => {
      renderDiff({ key, type: 'text' }, 'INTERNAL_BEFORE', 'INTERNAL_AFTER')
      expect(screen.queryByText('INTERNAL_BEFORE')).not.toBeInTheDocument()
      expect(screen.queryByText('INTERNAL_AFTER')).not.toBeInTheDocument()
    })
  }

  // The one exception, and the reason the skip set can't just be the whole
  // list: some categories configure this as a real, editable "Description".
  it('still shows googleDescription, which some categories offer as real content', () => {
    renderDiff({ key: SHOWN_WHEN_CONFIGURED, type: 'text' }, 'Old blurb', 'New blurb')
    expect(screen.getByText('New blurb')).toBeInTheDocument()
  })
})

// Reported from the real queue: Mekor Habracha has ten minyanim, one Kabbalas
// Shabbos time gained a "(not after 7:00 PM)" clamp, and the card struck
// through all ten in red and repeated all ten in green. Twenty lines to read
// to find one changed word.
describe('a multi-line field marks only the lines that changed', () => {
  const many: Minyan[] = [
    { id: 'a', tefillah: 'shacharis', days: ['mon', 'thu'], time: '6:45am' },
    { id: 'b', tefillah: 'shacharis', days: ['sun'], time: '8:30am' },
    { id: 'c', tefillah: 'kabbalas_shabbos', days: ['fri'], time: 'At Candle Lighting', anchor: 'candle_lighting', offsetMinutes: 0 },
    { id: 'd', tefillah: 'mincha', days: ['sat'], time: '12:20pm' },
  ]
  // The exact edit from the report: a clamp added to one row.
  const clamped: Minyan[] = many.map((m) =>
    m.id === 'c'
      ? { ...m, notAfter: '19:00', time: formatAnchorRule('candle_lighting', 0, { notAfter: '19:00' }) }
      : m,
  )

  function lineClasses(text: RegExp): string {
    return screen.getByText(text).className
  }

  it('strikes through only the line that was replaced', () => {
    renderDiff({ key: 'davening', type: 'minyanim' }, many, clamped)
    expect(lineClasses(/^Kabbalas Shabbos.*At Candle Lighting$/)).toContain('line-through')
    expect(lineClasses(/^Kabbalas Shabbos.*not after 7:00 PM/)).toContain('text-green-700')
  })

  it('leaves the untouched minyanim as plain context, neither red nor green', () => {
    renderDiff({ key: 'davening', type: 'minyanim' }, many, clamped)
    for (const untouched of [/^Shacharis.*6:45am$/, /^Shacharis.*8:30am$/, /^Mincha.*12:20pm$/]) {
      const cls = lineClasses(untouched)
      expect(cls).not.toContain('line-through')
      expect(cls).not.toContain('text-green-700')
    }
  })

  it('shows each untouched minyan once, not twice', () => {
    renderDiff({ key: 'davening', type: 'minyanim' }, many, clamped)
    // The old rendering repeated every line — once struck through, once in
    // green — which is what made a ten-minyan edit unreadable.
    expect(screen.getAllByText(/^Mincha.*12:20pm$/)).toHaveLength(1)
  })
})
