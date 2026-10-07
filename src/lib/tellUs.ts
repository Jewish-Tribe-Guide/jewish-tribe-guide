import type { CategoryConfig, CategoryField } from './categories'

/** The box's example, by where it was opened: what that page keeps.
 *
 *  A category's own example is made from its fields (Oct 5: Hotels showed a
 *  store's and a shul's, the only two written), so every category, and one
 *  an admin adds, gets one that fits: its hours, its choices, then its
 *  phone and website. A store's items and a shul's
 *  davening times keep their own. `times`: the Minyanim view, where the
 *  times are what someone came about. */
export function tellUsPlaceholder(category?: Pick<CategoryConfig, 'detailFields' | 'hasPhone'>, { times = false }: { times?: boolean } = {}): string {
  if (!category) return 'What did you see? An item at a store, new hours, a new place, a shul’s times, or paste a post from the group.'
  const fields = category.detailFields
  if (times) return 'Paste the shul’s email or this week’s times, or add a photo or PDF of the schedule.'
  if (fields.some((f) => f.type === 'tags')) return 'What did you see? “Trader Joe’s on Arch has kosher ground beef”, new hours, or paste a post from the group.'
  // Yes/no fields are left out: "its shabbat friendly" isn't a sentence.
  const rank = (f: CategoryField) => ['minyanim', 'hours', 'select'].indexOf(f.type)
  const named = fields
    .filter((f) => rank(f) >= 0)
    .sort((a, b) => rank(a) - rank(b))
    .map((f) => (f.type === 'minyanim' ? 'davening times' : f.label.toLowerCase()))
  if (category.hasPhone !== false) named.push('phone')
  if (fields.some((f) => f.type === 'url' && /web|site/i.test(`${f.key} ${f.label}`))) named.push('website')
  const three = [...new Set(named)].slice(0, 3)
  const list = three.length > 1 ? `${three.slice(0, -1).join(', ')} or ${three.at(-1)}` : three[0]
  return `What did you see? A new place, or what changed at one${list ? `: its ${list}` : ''}. Or paste a post from the group.`
}
