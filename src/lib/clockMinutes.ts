// ── A clock time, read one way (Nov 20) ─────────────────────────────────────
// There were two readers (the health sweep). minyanText's read "7 AM",
// "7:15am", "7:15 a.m." and "19:30"; davening's parseTimeToMinutes read
// only "7:15 AM" and "19:30", so a shul's "8am" was words to it, like
// "Call to confirm": it sorted after every other minyan, was never the
// next minyan (upcomingDavening), and was said under the row as a note.
// Both read here now. Its own file since minyanText imports davening.

/** "7:15am", "19:30", "7 AM" as minutes from midnight; null for words
 *  ("Call to confirm") or nothing. */
export function clockMinutes(time: string): number | null {
  const t = time.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i)
  if (!t) return null
  let h = Number(t[1])
  const m = t[2] ? Number(t[2]) : 0
  const half = t[3]?.toLowerCase().replace(/\./g, '')
  if (h > 23 || m > 59 || (!half && !t[2])) return null
  if (half === 'pm' && h !== 12) h += 12
  if (half === 'am' && h === 12) h = 0
  return h * 60 + m
}
