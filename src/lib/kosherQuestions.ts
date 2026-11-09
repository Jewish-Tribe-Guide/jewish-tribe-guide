import type { CategoryField } from './categories'

// A hechsher's two questions: whether everything at a place is kosher, and
// if not, what isn't (CategoryField.caveat). Worded as Food asks them live.
// The user, Nov 8: a page turns them on or off, since some communities
// never have a place that's only partly kosher.

export function kosherQuestions(flagKey = 'kosherPartial', noteKey = 'kosherNote'): [CategoryField, CategoryField] {
  return [
    { key: flagKey, label: 'Everything here is kosher', type: 'boolean', renderAs: 'hidden', invertDisplay: true },
    {
      key: noteKey,
      label: 'What isn’t kosher?',
      type: 'textarea',
      renderAs: 'hidden',
      showIf: { field: flagKey, equals: true },
      placeholder: 'e.g. The dairy menu is certified; the meat counter is not under supervision.',
    },
  ]
}

/** The caveat a hechsher starts with when its questions are turned on. */
export const KOSHER_CAVEAT = { flagField: 'kosherPartial', noteField: 'kosherNote' } as const
