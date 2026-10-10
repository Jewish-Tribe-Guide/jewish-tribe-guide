import type { Minyan } from './davening'

// ── One of a shul's two usual boxes, edited on its own (Oct 10) ─────────────
// A shul's times are one list of rows, shown as two boxes: "Usual weekday
// times" and "Usual Shabbos times" (weekTable.ts). Edit under a box opens
// just that box's times, so a row is cut to the days the box shows: Friday
// night and Saturday are Shabbos's, Friday's Shacharis and Sunday to
// Thursday the week's. A row that spans both (Mincha, Sunday to Friday)
// appears in each box with only that box's days.
//
// Sent back, each edited row replaces its part of the row it came from; the
// rest of that row stays as it was. A row nobody changed stays exactly as
// it is stored, unsplit, so opening the box and sending nothing changes
// nothing.

export type MinyanBox = 'weekday' | 'shabbos'

/** The days a row in the box can be put on, and a new row's first day. */
export const BOX_DAYS: Record<MinyanBox, { choices: Minyan['days']; newRow: Minyan['days'] }> = {
  shabbos: { choices: ['fri', 'sat'], newRow: ['sat'] },
  weekday: { choices: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'rosh_chodesh', 'yom_tov', 'holiday'], newRow: [] },
}

/** The days of a row the box shows. Rosh Chodesh is the week's. */
function boxDays(m: Minyan, box: MinyanBox): Minyan['days'] {
  return m.days.filter((d) => {
    const shabbos = d === 'sat' || (d === 'fri' && m.tefillah !== 'shacharis')
    return box === 'shabbos' ? shabbos : !shabbos
  })
}

/** The box's part of each row that has one, under the row's own id. */
export function minyanimForBox(rows: readonly Minyan[], box: MinyanBox): Minyan[] {
  return rows.flatMap((m) => {
    const days = boxDays(m, box)
    return days.length > 0 ? [{ ...m, days }] : []
  })
}

const other = (box: MinyanBox): MinyanBox => (box === 'shabbos' ? 'weekday' : 'shabbos')
const same = (a: Minyan, b: Minyan) => JSON.stringify(a) === JSON.stringify(b)

/** The whole list again, with the box's part replaced by `edited`. */
export function mergeMinyanimBox(rows: readonly Minyan[], box: MinyanBox, edited: readonly Minyan[]): Minyan[] {
  const byId = new Map(edited.map((m) => [m.id, m]))
  const out: Minyan[] = []
  for (const row of rows) {
    const days = boxDays(row, box)
    if (days.length === 0) {
      out.push(row)
      continue
    }
    const now = byId.get(row.id)
    byId.delete(row.id)
    const was = { ...row, days }
    // Untouched: the row as it was, whole.
    if (now && same(now, was)) {
      out.push(row)
      continue
    }
    const rest = boxDays(row, other(box))
    if (rest.length > 0) out.push({ ...row, days: rest })
    // The edited part under its own id once the row is split, so two rows
    // never share one.
    if (now) out.push(rest.length > 0 ? { ...now, id: `${row.id}-${box}` } : now)
  }
  // Rows added in the box.
  out.push(...byId.values())
  return out
}
