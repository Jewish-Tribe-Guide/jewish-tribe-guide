// What Add calls the place it's adding (board U3, Nov 26): "Add a
// synagogue" and "Find the synagogue" when the category's name is a thing
// you can count, which its plural says ("Synagogue", "Synagogues"). A name
// with no plural of its own ("Food", "Childcare", "Networking") isn't one
// ("Add a food"), so it's "Add to Food" and "Find the place".

type Named = { label: string; pluralLabel?: string }

/** "Synagogue" → "synagogue", "WhatsApp Group" → "WhatsApp group": a word
 *  that is only capitalised drops it; a name like WhatsApp keeps its own. */
function asNoun(label: string): string {
  return label
    .trim()
    .split(/\s+/)
    .map((w) => (/^[A-Z][a-z’']*$/.test(w) ? w.toLowerCase() : w))
    .join(' ')
}

export function addingWords(category: Named): { title: string; find: string } {
  const label = category.label.trim()
  const plural = category.pluralLabel?.trim()
  if (!plural || plural === label) return { title: `Add to ${label}`, find: 'Find the place' }
  const noun = asNoun(label)
  const a = /^[aeiou]/i.test(noun) ? 'an' : 'a'
  return { title: `Add ${a} ${noun}`, find: `Find the ${noun}` }
}
