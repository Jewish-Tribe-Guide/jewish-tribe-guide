'use client'

// Listings arrive with the page now (see listingsContext) rather than being
// fetched after hydration. Kept as a module so the home screen and the map,
// which import `useAllListings` from here, didn't have to change.
export { useAllListings } from './listingsContext'
