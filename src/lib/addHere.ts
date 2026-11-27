'use client'

import { useEffect, useEffectEvent } from 'react'

// The computer's "+ Add or update" sits in the site header (Nov 27, board
// D1b), the same on every screen, but what it opens depends on the screen: a
// category page's own box knows its category ("Add to Food" without asking),
// the Eruv page's adds an eruv, and everywhere else the site's own box asks
// what kind of place. So the header asks the screen first: ADD_HERE, which a
// screen with its own Add takes (preventDefault), and only if none does,
// OPEN_ADD, the site's own box (SiteAddButton), as the home search's "How do
// I add a listing?" has always opened it.

export const ADD_HERE = 'jpc:add-here'
export const OPEN_ADD = 'jpc:open-add'

/** Opens Add: the screen's own, if it has one, else the site's. */
export function requestAdd(): void {
  const here = new CustomEvent(ADD_HERE, { cancelable: true })
  document.dispatchEvent(here)
  if (!here.defaultPrevented) document.dispatchEvent(new CustomEvent(OPEN_ADD))
}

/** A screen with its own Add takes the header's, while `enabled`. */
export function useAddHere(enabled: boolean, onAdd: () => void): void {
  const add = useEffectEvent(onAdd)
  useEffect(() => {
    if (!enabled) return
    const take = (e: Event) => {
      e.preventDefault()
      add()
    }
    document.addEventListener(ADD_HERE, take)
    return () => document.removeEventListener(ADD_HERE, take)
  }, [enabled])
}
