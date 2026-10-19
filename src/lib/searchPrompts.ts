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
  else if (minutes >= 17 * 60 && minutes < 23 * 60) out.push('Maariv tonight?')
  else out.push('Next minyan')
  // Friday before Shabbos: the errand everyone is on.
  if (day === 'fri' && minutes < 15 * 60) out.push('Where can I get challah?')
  // Friday and Shabbos: the eruv.
  if (day === 'fri' || day === 'sat') out.push('Is the eruv up?')
  // Something to eat, while there is.
  if (minutes >= 7 * 60 && minutes < 22 * 60) out.push('Food open now')
  // Friday morning already asks where to get it.
  out.push(...TIMELESS.filter((q) => !(q === 'Challah' && out.includes('Where can I get challah?'))))
  // More for a phone's row, which swipes and holds six (SearchPrompts); a
  // computer shows three, so it rarely gets this far.
  out.push('Shul near me', 'Mikvah open today')
  if (minutes >= 11 * 60 && minutes < 22 * 60) out.push('Pizza open now')
  out.push('Kosher bakery')
  return out
}

// Everyday things first, and from across the guide, not only shul and
// kashrus (the user, Oct 18: chalav yisroel milk, and the Hebrew date beside
// it, made the phone home read "a little too Jewish"): a grocery item, a
// place to stay most wouldn't think to search for, the young professionals'
// groups, a treat. Short, so three fit on a computer's one line (the user,
// Oct 16: "Where can I get chalav yisroel milk?" was the one that wrapped).
const TIMELESS = ['Challah', 'Shabbos-friendly hotel', 'Young professionals', 'Ice cream', 'Kosher wine'] as const

/** Whether an answer is one worth showing off: places found, and no
 *  sentence saying no. "Nothing open right now" and "No more Maariv today"
 *  are true, but a first try that says no teaches that search says no. A
 *  search that lands on its places without a sentence ("Shabbos-friendly
 *  hotel": Hotels, 2 Shabbat friendly) is a yes. */
export function answersWell(answer: { text: string } | null, hitCount: number): boolean {
  if (hitCount === 0) return false
  return !answer || !/^(Nothing|No )/.test(answer.text)
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
