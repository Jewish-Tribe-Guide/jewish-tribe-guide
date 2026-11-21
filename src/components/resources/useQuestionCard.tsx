import { useState, type ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { parseQuestionCard, pickQuestion } from '@/lib/questionCards'
import QuestionCard, { useAskedPlaces } from './QuestionCard'

// A category page's one question card, and where in the list it goes
// (moved out of GenericDirectory whole).
export function useQuestionCard({
  category,
  items,
  filtered,
  shownItems,
  typed,
  sections,
  rowPlaces,
  onEdit,
}: {
  category: CategoryConfig
  items: DirectoryResource[]
  filtered: DirectoryResource[]
  shownItems: DirectoryResource[]
  typed: boolean
  sections: { key: string; items: DirectoryResource[]; hidden?: boolean }[]
  rowPlaces: Map<string, string | null>
  onEdit: (item: DirectoryResource) => void
}): { questionSpot: { section: string; id: string } | 'end' | null; questionCard: ReactNode } {
  // The category's one question card (see QuestionCard), right under the
  // place it asks about (decided Oct 4, built Oct 6: it sat after the fifth
  // place, whichever place it asked about). The page and the card share
  // which places this browser has been asked about, so they agree on which
  // one is next; while a thank-you shows, the card stays under the place it
  // thanks for. After the group lines when that place's group is shut. Not
  // among a search's results, which are an answer.
  const [askedPlaces, setAskedPlaces] = useAskedPlaces(category.id)
  const [heldQuestion, setHeldQuestion] = useState<string | null>(null)
  const questionShown = shownItems.length > 0 ? shownItems : filtered
  const questionOn = !typed && !!parseQuestionCard(category.questionCard)
  const questionAbout = questionOn
    ? (heldQuestion ?? pickQuestion(category, questionShown, items, new Set(askedPlaces), (item) => rowPlaces.get(item.id) ?? null)?.item.id ?? null)
    : null
  const questionSpot: { section: string; id: string } | 'end' | null = (() => {
    if (!questionAbout) return null
    for (const section of sections) {
      if (!section.hidden && section.items.some((item) => item.id === questionAbout)) return { section: section.key, id: questionAbout }
    }
    return 'end'
  })()

  const questionCard = questionSpot && (
    <QuestionCard
      category={category}
      shown={questionShown}
      all={items}
      place={(item) => rowPlaces.get(item.id) ?? null}
      onEdit={onEdit}
      asking={{ asked: askedPlaces, setAsked: setAskedPlaces, onHeld: setHeldQuestion }}
    />
  )
  return { questionSpot, questionCard }
}
