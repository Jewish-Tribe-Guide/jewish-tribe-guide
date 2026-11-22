import type { CategoryConfig } from './categories'
import type { ScreenHeaderState } from './headerVisibility'
import type { MobileTabConfig } from './siteSettings'

const noop = () => {}

/** What a screen will put in the phone's header (useSetScreenHeader,
 *  useSetTabHeader), told from its address, for the paint before the
 *  screen has run and said so itself. The same titles those screens set:
 *  a category's page (and a listing's, with the guide's name over it), the
 *  eruv and zmanim pages, and a tab's own page. Anything else is null, the
 *  logo and the site's name, as before. */
export function screenHeaderFromPath(
  pathname: string,
  categories: readonly Pick<CategoryConfig, 'id' | 'kind' | 'pluralLabel'>[],
  tabs: readonly Pick<MobileTabConfig, 'target' | 'label'>[] | null,
): ScreenHeaderState {
  // ['', community, ...rest]
  const rest = pathname.split('/').filter(Boolean).slice(1)
  const [first, second, ...more] = rest
  if (!first || more.length > 0) return null
  const tabLabel = (target: string) => tabs?.find((t) => t.target === target)?.label?.trim() || null
  if (!second) {
    if (first === 'you') return { title: tabLabel('you') ?? 'You' }
    if (first === 'changes') return { title: tabLabel('changes') ?? 'What changed' }
    if (first === 'browse') return { title: tabLabel('browse') ?? 'Browse' }
    if (first === 'feedback') {
      const tab = tabLabel('feedback')
      return tab ? { title: tab } : { title: 'Feedback', onBack: noop }
    }
  }
  const category = categories.find((c) => c.id === first)
  if (!category) return null
  if (category.kind === 'listing') return second ? { title: category.pluralLabel, onBack: noop, named: true } : { title: category.pluralLabel, onBack: noop }
  if ((category.kind === 'eruv' || category.kind === 'zmanim') && !second) return { title: category.pluralLabel, onBack: noop }
  return null
}
