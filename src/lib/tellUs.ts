/** The "+ Add" box's one line inside it, by what it was opened for: what to
 *  do there, never examples (the user, Oct 10: the box should say what to
 *  do; examples read as more to take in). The place's own name where there
 *  is one, as "Paste Mekor Habracha’s email" first did.
 *
 *  `times`: a shul's this-week schedule, or the Minyanim view. `menu`: "Add
 *  their menu" on a place with no dishes. `about`: the listing it's about. */
export function tellUsPlaceholder({ times = false, menu = false, about }: { times?: boolean; menu?: boolean; about?: { name: string } } = {}): string {
  if (menu) return 'Paste their menu, or a link to it.'
  if (times) return about ? `Paste ${about.name}’s email or newsletter for this week.` : 'Paste a shul’s email or newsletter for this week.'
  if (about) return `Write what changed at ${about.name}, or paste a message about it.`
  return 'Write what you saw at a place, new or already here, or paste a post from the group.'
}
