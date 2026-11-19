'use client'

import { Component, type ReactNode } from 'react'
import { reportError } from '@/lib/deferredSentry'
import MapUnavailable from './MapUnavailable'

/** Keeps a failing Google map from taking the page down with it. When Google
 *  refuses the map (a key that doesn't allow the address, billing off), its
 *  own code can throw from inside ours (a pin redrawn, a row's pin lit)
 *  before it has said the key was refused, so the map's own "couldn't load"
 *  check comes a moment too late. Without this the error replaced the whole
 *  page, list, search and Saved chip included: seen on the category page,
 *  and on the Map page in CI (Nov 16, a saved place's pin redrawn). Now only
 *  the map's box says so. */
export default class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error('[map]', error)
    reportError(error)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return <MapUnavailable />
  }
}
