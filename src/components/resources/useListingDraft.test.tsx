// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { useListingDraft } from './useListingDraft'

// What reaches a submission. Carried over from the old sectioned form's
// tests (ListingForm.test.tsx) when it was deleted; every editor that writes
// a listing builds its submission here. Starting from a Google pick is in
// FindPlace.test.tsx.

describe('useListingDraft.buildSubmission', () => {
  // A field gated on another (showIf) is sent only while it's shown — a
  // value left behind from before its trigger was turned off goes nowhere.
  it('sends a showIf-gated field only once its trigger is answered to match', () => {
    const category = makeCategory({
      detailFields: [
        { key: 'isKosher', label: 'Kosher', type: 'boolean' },
        { key: 'kosherItems', label: 'Kosher items', type: 'text', showIf: { field: 'isKosher', equals: true } },
      ],
    })
    const { result } = renderHook(() => useListingDraft(category, makeListing({ kosherItems: 'Challah' })))

    expect(result.current.buildSubmission().details).not.toHaveProperty('kosherItems')
    act(() => result.current.setDetail('isKosher', true))
    expect(result.current.buildSubmission().details).toMatchObject({ isKosher: true, kosherItems: 'Challah' })
  })

  // A tags field keeps a second, "sometimes in stock" list beside its main
  // one (key + "_sometimes"). It has no field definition of its own, so it
  // only reaches the submission because the tags field carries it along —
  // drop that and an edit to anything else silently wipes every "~" tag.
  it('carries a tags field’s "sometimes" list along, untouched', () => {
    const category = makeCategory({ detailFields: [{ key: 'items', label: 'Kosher items', type: 'tags' }] })
    const { result } = renderHook(() => useListingDraft(category, makeListing({ items: ['Challah'], items_sometimes: ['Steak'] })))

    act(() => result.current.setName('New Name'))
    const { details } = result.current.buildSubmission()
    expect(details.items).toEqual(['Challah'])
    expect(details.items_sometimes).toEqual(['Steak'])
  })
})
