// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { Minyan } from '@/lib/davening'
import DaveningTimes from './DaveningTimes'

afterEach(cleanup)

// Two groups whose day labels differ wildly in width — the exact shape that
// exposed the bug this file's layout was rewritten for. Rendered without geo,
// so no anchor calculation runs and the assertions stay about layout.
const minyanim: Minyan[] = [
  { id: '1', tefillah: 'shacharis', days: ['mon', 'thu', 'rosh_chodesh'], time: '6:45am' },
  { id: '2', tefillah: 'shacharis', days: ['sun'], time: '8:30am', notes: 'Followed by bagels' },
  { id: '3', tefillah: 'mincha', days: ['sat'], time: '12:20pm', notes: 'Winter only' },
]

describe('DaveningTimes', () => {
  // jsdom has no layout engine, so it can't measure that the times line up.
  // What it can hold is the structural contract that makes them line up: every
  // group's rows sit in ONE grid whose columns they share, via `subgrid`.
  // Before, each group carried its own `grid-cols-[auto_1fr]` and sized the day
  // column to its own longest label, so a card with both "Mon, Thu, Rosh
  // Chodesh" and "Sat" put its times at two different left edges.
  it('renders every group into a single shared column grid', () => {
    const { container } = render(<DaveningTimes minyanim={minyanim} geo={null} />)

    const lists = Array.from(container.querySelectorAll('dl'))
    expect(lists).toHaveLength(2) // Shacharis and Mincha

    for (const dl of lists) {
      expect(dl.className).toContain('grid-cols-subgrid')
      // No group may define columns of its own — that's what made them differ.
      expect(dl.className).not.toContain('fit-content')
    }

    // Both subgrids resolve to the same ancestor that actually defines the
    // columns, which is what makes the widths shared rather than coincidental.
    const roots = lists.map((dl) => dl.closest('[class*="fit-content"]'))
    expect(roots[0]).not.toBeNull()
    expect(roots[0]).toBe(roots[1])
  })

  // The notes used to trail the time inline in parentheses. With the columns
  // aligned globally the widest day label sets where every time starts, so the
  // value column is narrower and the notes were the first thing to wrap badly.
  it('puts a note on its own line under the time, without parentheses', () => {
    render(<DaveningTimes minyanim={minyanim} geo={null} />)

    const note = screen.getByText('Winter only')
    expect(note.textContent).not.toContain('(')

    // Its own block inside the <dd>, not a sibling of the time text.
    const line = note.parentElement!
    expect(line.className).toContain('block')
    expect(line.closest('dd')!.textContent).toContain('12:20pm')
  })

  // The shared column is sized by the widest label across every group, so one
  // "Mon, Thu, Rosh Chodesh" row would otherwise push all four tefillos' times
  // right on its own. The column is capped and the label wraps instead — but
  // only at its commas: the space inside a day's own name is a non-breaking
  // one, so the break can't land as "Mon, Thu, Rosh" over "Chodesh".
  it('lets a long day label wrap, but only after a comma', () => {
    const { container } = render(<DaveningTimes minyanim={minyanim} geo={null} />)

    const root = container.querySelector('[class*="fit-content"]')!
    expect(root).not.toBeNull()

    const long = [...root.querySelectorAll('dt')].find((el) => el.textContent!.includes('Rosh'))!
    // Breakable after each comma...
    expect(long.textContent).toContain(', ')
    // ...and not inside the day's own name.
    expect(long.textContent).toContain('Rosh\u00a0Chodesh')
    // A capped column can only wrap if the label is allowed to.
    expect(long.className).not.toContain('whitespace-nowrap')
  })
})

// Seasons: dimmed and labelled, never dropped. The row is still the answer to
// "when is mincha in the summer?" asked in January, and if the derived season
// is wrong a dimmed row that still reads "Winter only" is something a visitor
// can see and discount — a missing one is not.
describe('DaveningTimes — seasons', () => {
  const seasonal: Minyan[] = [
    { id: 'w', tefillah: 'maariv', days: ['sun'], time: '6:30pm', season: 'winter' },
    { id: 's', tefillah: 'maariv', days: ['sun'], time: '8:45pm', season: 'summer' },
  ]

  function renderInJuly() {
    vi.setSystemTime(new Date('2026-07-15T12:00:00'))
    return render(<DaveningTimes minyanim={seasonal} geo={null} />)
  }

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows both seasons, labelled, and dims only the one out of season', () => {
    const { container } = renderInJuly()

    // Both times present — nothing is filtered out.
    expect(screen.getByText('6:30pm')).toBeInTheDocument()
    expect(screen.getByText('8:45pm')).toBeInTheDocument()
    expect(screen.getByText('Winter only')).toBeInTheDocument()
    expect(screen.getByText('Summer only')).toBeInTheDocument()

    // In July the winter row is the dim one.
    const dimmed = [...container.querySelectorAll('dd')].filter((el) =>
      el.className.includes('opacity-45'),
    )
    expect(dimmed).toHaveLength(1)
    expect(dimmed[0].textContent).toContain('6:30pm')
  })

  it('dims the other one in January', () => {
    vi.setSystemTime(new Date('2026-01-15T12:00:00'))
    const { container } = render(<DaveningTimes minyanim={seasonal} geo={null} />)

    const dimmed = [...container.querySelectorAll('dd')].filter((el) =>
      el.className.includes('opacity-45'),
    )
    expect(dimmed).toHaveLength(1)
    expect(dimmed[0].textContent).toContain('8:45pm')
  })

  // Merging two same-day rows into "6:30pm, 8:45pm" would lose the only thing
  // that says which applies when.
  it('does not merge a winter row into a summer one', () => {
    const { container } = renderInJuly()
    const values = [...container.querySelectorAll('dd')].map((el) => el.textContent)
    expect(values.some((v) => v?.includes('6:30pm') && v?.includes('8:45pm'))).toBe(false)
  })
})
