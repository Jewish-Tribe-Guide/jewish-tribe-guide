// A named group of cards on the home screen (e.g. "Food Establishments"),
// admin-editable via the Sections tab in /admin. Replaces the old hardcoded
// HOME_SECTIONS constant in src/components/home/sections.tsx.
export type HomeSection = {
  id: string
  title: string
  sortOrder: number
  /** Ordered CardDef ids (category slugs, or fixed ids like 'support', 'map',
   *  'medical') — which cards belong here, and in what order. */
  cardIds: string[]
}
