// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
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
      expect(dl.className).not.toContain('grid-cols-[auto_1fr]')
    }

    // Both subgrids resolve to the same ancestor that actually defines the
    // columns, which is what makes the widths shared rather than coincidental.
    const roots = lists.map((dl) => dl.closest('.grid-cols-\\[auto_1fr\\]'))
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
})
