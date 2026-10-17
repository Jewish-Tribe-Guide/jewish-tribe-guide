/** The "+ Add" box's one line inside it, by what it was opened for: what to
 *  do there, never examples (the user, Oct 10: the box should say what to
 *  do; examples read as more to take in), then what the site does with it
 *  (Oct 16: with only the first half, what happened after "Read the menu"
 *  wasn't clear). Inside the box, as before (Oct 16: a line over it was
 *  tried, and taken back). The place's own name where there is one, as "Paste Mekor
 *  Habracha’s email" first did. No word "AI": the result's card says it.
 *
 *  `times`: a shul's this-week schedule, or the Minyanim view. `menu`: "Add
 *  their menu" on a place with no dishes. `about`: the listing it's about. */
export function tellUsPlaceholder({ times = false, menu = false, about }: { times?: boolean; menu?: boolean; about?: { name: string } } = {}): string {
  if (menu) return 'Paste their menu or a link to it, or add photos of it. We’ll try to read the main dishes off it, for you to check.'
  if (times) {
    const whose = about ? `${about.name}’s` : 'a shul’s'
    return `Paste ${whose} email or newsletter for this week, or add a photo of it. We’ll try to read the times off it, for you to check.`
  }
  const what = about ? `Write what changed at ${about.name}, or paste a message about it.` : 'Write what you saw at a place, new or already here, or paste a post from the group.'
  return `${what} We’ll try to read what changes, for you to check.`
}
