/** The box's example, by where it was opened: what that page keeps. */
export function tellUsPlaceholder(kind: 'items' | 'times' | 'any'): string {
  if (kind === 'items') return 'What did you see? “Trader Joe’s on Arch has kosher ground beef”, or paste a post from the group.'
  if (kind === 'times') return 'Paste the shul’s email or this week’s times, or add a photo of the schedule.'
  return 'What did you see? An item at a store, a new place, a shul’s times, or paste a post from the group.'
}
