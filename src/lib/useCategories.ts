'use client'

// The category list now arrives with the page (see loadCommunityContent), so
// this is a re-export of the context reader rather than its own fetch. Kept as
// a module so the ~20 components importing `useCategories` from here didn't
// have to change when the data moved to the server.
export { useCategories } from './contentContext'
export { FALLBACK_CATEGORIES } from './categoryFallback'
