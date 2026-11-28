import { describe, expect, it } from 'vitest'
import { isPlaceKind, kindKey, kindKeyById, placeKindFromSlug, kindFromGoogleTypes } from './placeKinds'
import { schemaTypeForCategory } from './structuredData'

// A category's kind (brief, question 8): Philly's categories take theirs
// from today's slug, so nothing changes for them; any other community's
// Shuls get the shul icon, search words and schema type by kind.
describe('place kinds', () => {
  it("gives Philly's categories their kind from today's slug", () => {
    expect(placeKindFromSlug('synagogue')).toBe('shuls')
    expect(placeKindFromSlug('restaurant')).toBe('food')
    expect(placeKindFromSlug('grocery')).toBe('groceries')
    expect(placeKindFromSlug('mikvah')).toBe('mikvahs')
    expect(placeKindFromSlug('hotel')).toBe('hotels')
    expect(placeKindFromSlug('hospital')).toBe('hospitals')
    expect(placeKindFromSlug('school')).toBe('plain')
  })

  it('finds a kind’s icon and words by its kind, whatever the slug', () => {
    expect(kindKey({ id: 'shuls-ues', placeKind: 'shuls' })).toBe('synagogue')
    expect(kindKey({ id: 'restaurant' })).toBe('restaurant')
    // A Plain category keeps its own id, and with it a drawn icon of its own.
    expect(kindKey({ id: 'school', placeKind: 'plain' })).toBe('school')
    // A saved Plain wins over the slug.
    expect(kindKey({ id: 'synagogue', placeKind: 'plain' })).toBe('synagogue')
    expect(kindKeyById('eat', [{ id: 'eat', placeKind: 'food' }])).toBe('restaurant')
    expect(kindKeyById('eat', null)).toBe('eat')
  })

  it('types a place for search engines by its kind', () => {
    expect(schemaTypeForCategory({ id: 'shuls-ues', placeKind: 'shuls' })).toBe('Synagogue')
    expect(schemaTypeForCategory({ id: 'eat', placeKind: 'food' })).toBe('FoodEstablishment')
  })

  it('knows its kinds', () => {
    expect(isPlaceKind('food')).toBe(true)
    expect(isPlaceKind('restaurant')).toBe(false)
    expect(isPlaceKind(null)).toBe(false)
  })
})

// Tracker 101: Google's types for a place picked from search.
describe('kindFromGoogleTypes', () => {
  it('reads the kind Google’s types point to', () => {
    expect(kindFromGoogleTypes(['synagogue', 'place_of_worship', 'establishment'])).toBe('shuls')
    expect(kindFromGoogleTypes(['pizza_restaurant', 'restaurant', 'food'])).toBe('food')
    expect(kindFromGoogleTypes(['bakery', 'store', 'food'])).toBe('food')
    expect(kindFromGoogleTypes(['supermarket', 'grocery_store', 'food', 'store'])).toBe('groceries')
    expect(kindFromGoogleTypes(['hospital', 'health'])).toBe('hospitals')
  })

  it('takes the place for what it is first: a hotel with a restaurant is a hotel', () => {
    expect(kindFromGoogleTypes(['restaurant', 'lodging', 'hotel'])).toBe('hotels')
  })

  it('guesses nothing from types that mean no kind, or none', () => {
    expect(kindFromGoogleTypes(['point_of_interest', 'establishment'])).toBeNull()
    expect(kindFromGoogleTypes(['barber_shop', 'store'])).toBeNull()
    expect(kindFromGoogleTypes([])).toBeNull()
    expect(kindFromGoogleTypes(undefined)).toBeNull()
  })
})
