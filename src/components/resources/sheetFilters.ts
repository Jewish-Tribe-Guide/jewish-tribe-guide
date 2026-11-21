import type { Dispatch, SetStateAction } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import type { AskResult } from '@/lib/askSearch'
import { withoutOpenWords, withoutTerms } from '@/lib/ask'
import { sameItem, searchItems, type itemCounts } from '@/lib/itemFilter'
import { TEFILLAH_CHOICES, WITHIN_CHOICES, typedTefillahChoices } from '@/lib/minyanimFilters'

type Field = CategoryConfig['detailFields'][number]
type Setter<T> = Dispatch<SetStateAction<T>>

// What a category page's Filters sheet shows ticked, the search's own
// filter words included, and what its choices do (moved out of
// GenericDirectory whole).
export function sheetFilters({
  category,
  items,
  typed,
  todayResult,
  minyanShulResult,
  hasFilterableHours,
  minyanimView,
  search,
  setSearch,
  openNow,
  setOpenNow,
  boolFilters,
  setBoolFilters,
  selectFilters,
  setSelectFilters,
  hasFilters,
  setHasFilters,
  clearFilters,
  minyanTefillos,
  setMinyanTefillos,
  minyanWithin,
  setMinyanWithin,
  landedSearch,
  itemsToShow,
  selectsToShow,
  filterableBooleans,
  filterableSelects,
}: {
  category: CategoryConfig
  items: DirectoryResource[]
  typed: boolean
  todayResult: AskResult | null
  minyanShulResult: AskResult | null
  hasFilterableHours: boolean
  minyanimView: boolean
  search: string
  setSearch: Setter<string>
  openNow: boolean
  setOpenNow: Setter<boolean>
  boolFilters: Record<string, boolean>
  setBoolFilters: Setter<Record<string, boolean>>
  selectFilters: Record<string, string[]>
  setSelectFilters: Setter<Record<string, string[]>>
  hasFilters: Record<string, string[]>
  setHasFilters: Setter<Record<string, string[]>>
  clearFilters: () => void
  minyanTefillos: string[]
  setMinyanTefillos: Setter<string[]>
  minyanWithin: string | null
  setMinyanWithin: Setter<string | null>
  landedSearch: string | null
  itemsToShow: { key: string; label: string; counts: ReturnType<typeof itemCounts> }[]
  selectsToShow: { key: string; label: string; values: string[]; chosen: string[] }[]
  filterableBooleans: Field[]
  filterableSelects: Field[]
}) {
  const toggleBool = (key: string) => setBoolFilters((prev) => ({ ...prev, [key]: !prev[key] }))
  // Adds or removes one value from a pick-list's chosen set.
  const toggleSelect = (key: string, value: string) =>
    setSelectFilters((prev) => {
      const cur = prev[key] ?? []
      return { ...prev, [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] }
    })
  // ── What the search reads as filters ──
  // A word an admin taught the search ("dairy" is Food type: Dairy), or
  // "open now", narrows the list as that filter would. The Filters sheet
  // shows it ticked and the button counts it; unticking it there takes the
  // word out of the search, so the two never disagree. Nothing about it on
  // the page itself: the word is in the box already (the user, Oct 10).
  const searchResult = typed ? todayResult : minyanShulResult
  const searchBools = new Map<string, string>()
  const searchSelects = new Map<string, Map<string, string>>()
  for (const t of searchResult?.taught ?? []) {
    const field = t.categoryId === category.id && t.field ? category.detailFields.find((f) => f.key === t.field) : undefined
    if (field?.type === 'boolean') searchBools.set(field.key, t.word)
    else if (field?.type === 'select' && t.value !== undefined) searchSelects.set(field.key, (searchSelects.get(field.key) ?? new Map()).set(t.value, t.word))
  }
  // An item said ("challah") is Has: Challah, the same way (searchItems).
  const searchHas = searchResult ? searchItems(category, items, searchResult) : new Map<string, Map<string, string>>()
  const searchOpenNow = !!searchResult?.query.openNow && hasFilterableHours
  // A tefillah typed in the Minyanim view ("mincha") is its chip ticked,
  // as "dairy" is Food type: Dairy (the user, Oct 15); unticking it takes
  // the word out of the search.
  const typedTefillos = minyanimView ? typedTefillahChoices(search) : new Map<string, string>()
  const sheetTefillos = [...new Set([...minyanTefillos, ...typedTefillos.keys()])]
  const dropWord = (word: string) => setSearch((prev) => withoutTerms(prev, word.split(' ')))
  const sheetOpenNow = openNow || searchOpenNow
  const toggleSheetOpenNow = () => {
    if (!sheetOpenNow) return setOpenNow(true)
    if (searchOpenNow) setSearch((prev) => withoutOpenWords(prev))
    setOpenNow(false)
  }
  const toggleSheetBool = (key: string) => {
    const word = searchBools.get(key)
    if (!word) return toggleBool(key)
    dropWord(word)
    setBoolFilters((prev) => ({ ...prev, [key]: false }))
  }
  const toggleSheetSelect = (key: string, value: string) => {
    const word = searchSelects.get(key)?.get(value)
    if (!word) return toggleSelect(key, value)
    dropWord(word)
    setSelectFilters((prev) => ({ ...prev, [key]: (prev[key] ?? []).filter((x) => x !== value) }))
  }
  const toggleSheetHas = (key: string, tag: string) => {
    const word = searchHas.get(key)?.get(tag)
    if (word) dropWord(word)
    setHasFilters((prev) => {
      const cur = prev[key] ?? []
      const on = cur.some((x) => sameItem(x, tag)) || !!word
      return { ...prev, [key]: on ? cur.filter((x) => !sameItem(x, tag)) : [...cur, tag] }
    })
  }

  // The sheet's Clear all clears what it shows, the search's filter words
  // too; the empty list's "Clear filters" (clearFilters) keeps the search.
  // A question read into the Filters (landedSearch) goes with them: it's
  // what they were.
  const clearSheet = () => {
    clearFilters()
    setMinyanTefillos([])
    setMinyanWithin(null)
    if (landedSearch !== null && search === landedSearch) return setSearch('')
    let next = search
    for (const word of [...searchBools.values(), ...[...searchSelects.values()].flatMap((m) => [...m.values()]), ...[...searchHas.values()].flatMap((m) => [...m.values()]), ...typedTefillos.values()]) next = withoutTerms(next, word.split(' '))
    setSearch(searchOpenNow ? withoutOpenWords(next) : next)
  }
  // Each ticked item as its listings spell it, so "has_m=wine" from an
  // address ticks their "Wine" rather than adding a second chip.
  const sheetItems = itemsToShow.map((f) => {
    const spelled = (t: string) => f.counts.find((c) => sameItem(c.tag, t))?.tag ?? t
    return { ...f, chosen: [...new Set([...(hasFilters[f.key] ?? []), ...(searchHas.get(f.key)?.keys() ?? [])].map(spelled))] }
  })
  const sheetSelects = selectsToShow.map((sel) => ({ ...sel, chosen: [...new Set([...sel.chosen, ...(searchSelects.get(sel.key)?.keys() ?? [])])] }))
  // The Minyanim view's own two, around the page's Denomination in the
  // sheet: Tefillah first, How far last, as the sketch has them (Oct 15).
  const minyanTefillahSelect = { key: '@tefillah', label: 'Tefillah', values: TEFILLAH_CHOICES.map((c) => c.label), chosen: sheetTefillos, ordered: true }
  const minyanWithinSelect = { key: '@within', label: 'How far', values: WITHIN_CHOICES.map((c) => c.label), chosen: minyanWithin ? [minyanWithin] : [], ordered: true }
  const onSheetSelect = (key: string, value: string) => {
    if (key === minyanTefillahSelect.key) {
      const word = typedTefillos.get(value)
      if (word) dropWord(word)
      return setMinyanTefillos((prev) => (prev.includes(value) || word ? prev.filter((x) => x !== value) : [...prev, value]))
    }
    if (key === minyanWithinSelect.key) return setMinyanWithin((prev) => (prev === value ? null : value))
    toggleSheetSelect(key, value)
  }
  const minyanFilterCount = sheetTefillos.length + (minyanWithin ? 1 : 0)
  // What the Filters button counts: everything the sheet shows ticked, each
  // choice one, Meat and Dairy two as Challah and Wine are (the user, Oct
  // 27: "If it filters more than one thing in one section that still counts
  // as multiple filters").
  const sheetFilterCount =
    filterableBooleans.filter((f) => boolFilters[f.key] || searchBools.has(f.key)).length +
    filterableSelects.reduce((n, f) => n + new Set([...(selectFilters[f.key] ?? []), ...(searchSelects.get(f.key)?.keys() ?? [])]).size, 0) +
    sheetItems.reduce((n, f) => n + f.chosen.length, 0) +
    (sheetOpenNow ? 1 : 0)
  return { searchBools, sheetTefillos, sheetOpenNow, toggleSheetOpenNow, toggleSheetBool, toggleSheetHas, clearSheet, sheetItems, sheetSelects, minyanTefillahSelect, minyanWithinSelect, onSheetSelect, minyanFilterCount, sheetFilterCount }
}
