import type { DayKey } from '@/lib/hours'

// ── Example questions under the search box ───────────────────────────────────
// People expect a site's search to be bad, and decide on their first try
// whether this one is. So the box offers a few questions to tap, chosen for
// the moment (a Maariv question in the evening, a Shacharis one in the
// morning), and only ones the guide answers well right now: the page runs
// each through the real search first and keeps the ones with a real, yes
// answer (see `answersWell`). A tap is a first try that works, and shows
// what can be asked.

/** Every question worth offering at this moment, most fitting first. Plain
 *  wording people would type, no community-specific names, so any community
 *  can offer them; which actually show depends on what its guide answers.
 *
 *  Null for no time yet (before the page has hydrated, see useNow): only
 *  the questions whose answer doesn't depend on it. */
export function candidatePrompts(at: { day: DayKey; minutes: number } | null): string[] {
  if (!at) return [...TIMELESS]
  const { day, minutes } = at
  const out: string[] = []
  // The next davening, by the time of day.
  if (minutes >= 4 * 60 && minutes < 10 * 60 + 30) out.push('Next Shacharis')
  else if (minutes >= 10 * 60 + 30 && minutes < 17 * 60) out.push('Next Mincha')
  else if (minutes >= 17 * 60 && minutes < 23 * 60) out.push('Is there still a Maariv tonight?')
  else out.push('Next minyan')
  // Friday before Shabbos: the errand everyone is on.
  if (day === 'fri' && minutes < 15 * 60) out.push('Where can I get challah?')
  // Something to eat, while there is.
  if (minutes >= 7 * 60 && minutes < 22 * 60) out.push('Food open now')
  out.push(TIMELESS[0], TIMELESS[1], 'Mikvah open today', TIMELESS[2])
  return out
}

const TIMELESS = ['Where can I get chalav yisroel milk?', 'Kosher wine', 'Shul near me'] as const

/** Whether an answer is one worth showing off: a real one, and a yes.
 *  "Nothing open right now" and "No more Maariv today" are true, but a first
 *  try that says no teaches that search says no. */
export function answersWell(answer: { text: string } | null, hitCount: number): boolean {
  if (!answer || hitCount === 0) return false
  return !/^(Nothing|No )/.test(answer.text)
}

/** The first `count` questions that answer well. */
export function pickPrompts(candidates: string[], works: (question: string) => boolean, count = 3): string[] {
  const picked: string[] = []
  for (const q of candidates) {
    if (picked.length === count) break
    if (works(q)) picked.push(q)
  }
  return picked
}
