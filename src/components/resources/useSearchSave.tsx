import SaveButton from '@/components/SaveButton'
import type { CategoryConfig } from '@/lib/categories'
import { routes } from '@/lib/routes'
import { makeSavedSearch } from '@/lib/savedSearches'
import { useSavedSearches } from '@/lib/savedSearchesContext'
import { categoryHref } from '@/lib/searchLands'
import { ui } from '@/lib/uiConfig'

// The bookmark in a category page's search box (moved out of
// GenericDirectory whole).
export function useSearchSave({
  category,
  communitySlug,
  search,
  minyanimView,
  openNow,
  boolFilters,
  selectFilters,
  hasFilters,
  landedSearch,
}: {
  category: CategoryConfig
  communitySlug: string | null | undefined
  search: string
  minyanimView: boolean
  openNow: boolean
  boolFilters: Record<string, boolean>
  selectFilters: Record<string, string[]>
  hasFilters: Record<string, string[]>
  landedSearch: string | null
}) {
  // ── Save this search (Oct 13, canvas page "you", board YouSave) ──
  // The bookmark in the box, filled while this is a saved search: the words
  // and the Filters chosen beyond them, as the address that opens it again.
  // Filters the words tick (searchBools/searchSelects/searchHas, open now)
  // aren't added: the words bring them back, so "challah" here is the same
  // search as "challah" saved from a home line.
  const savedSearches = useSavedSearches()
  const typedWords = search.trim()
  const thisSearch =
    !typedWords || !communitySlug
      ? null
      : minyanimView
        ? makeSavedSearch({ words: typedWords, kind: 'minyanim', categoryId: category.id, href: `${routes.slug(communitySlug, category.id)}?davening=1&q=${encodeURIComponent(typedWords)}` })
        : makeSavedSearch({
            words: typedWords,
            kind: 'category',
            categoryId: category.id,
            href: categoryHref(
              communitySlug,
              category.id,
              typedWords,
              {
                openNow,
                bool: Object.keys(boolFilters).filter((k) => boolFilters[k]),
                select: Object.fromEntries(Object.entries(selectFilters).filter(([, v]) => v.length)),
                has: Object.fromEntries(Object.entries(hasFilters).filter(([, v]) => v.length)),
              },
              landedSearch !== null && search === landedSearch,
            ),
          })
  const searchSave =
    ui.map.pins && savedSearches && thisSearch ? (
      <SaveButton plain saved={savedSearches.isSaved(thisSearch.key)} onToggle={() => savedSearches.toggle(thisSearch)} name={`“${typedWords}” in ${category.pluralLabel}`} />
    ) : undefined
  return searchSave
}
