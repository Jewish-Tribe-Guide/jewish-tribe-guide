import type { CategoryConfig } from '@/lib/categories'
import { makeCategory } from './providerFixtures'

// Categories shaped like the real ones (Oct 11), for the whole-listing
// editor's tests: Food, Grocery, a mikvah, a shul and a hospital.

export const FOOD: CategoryConfig = makeCategory({
  id: 'restaurant',
  label: 'Food',
  detailFields: [
    { key: 'hours', type: 'hours', label: 'Hours', renderAs: 'row' },
    { key: 'website', type: 'url', label: 'Website', renderAs: 'row' },
    { key: 'photo', type: 'image', label: 'Photo', renderAs: 'row' },
    { key: 'googleDescription', type: 'textarea', label: 'Description', renderAs: 'row' },
    { key: 's', type: 'text', label: 'Short Description', renderAs: 'row', showInHeader: true, headerMaxLength: 27 },
    { key: 't', type: 'select', label: 'Food Type', renderAs: 'badge', filterable: true, multiSelect: true, options: [{ label: 'Meat', value: 'Meat' }, { label: 'Dairy', value: 'Dairy' }, { label: 'Parve', value: 'Parve' }] },
    { key: 'kosherCert', type: 'select', label: 'Kosher Certification', renderAs: 'badge', filterable: true, caveat: { flagField: 'kosherPartial', noteField: 'kosherNote' }, options: [{ label: 'IKC', value: 'IKC' }, { label: 'OU', value: 'OU' }] },
    { key: 'kosherPartial', type: 'boolean', label: 'Everything here is kosher', renderAs: 'hidden', invertDisplay: true },
    { key: 'kosherNote', type: 'textarea', label: 'What isn’t kosher?', renderAs: 'hidden', showIf: { field: 'kosherPartial', equals: true } },
    { key: 'foodType', type: 'select', label: 'Store Type', renderAs: 'badge', filterable: true, options: [{ label: 'Restaurant', value: 'Restaurant' }, { label: 'Bakery', value: 'Bakery' }] },
    { key: 'k', type: 'url', label: 'Kosher Certification URL', renderAs: 'row' },
    { key: 'delivery_details', type: 'textarea', label: 'Delivery Details', renderAs: 'row' },
    { key: 'dishes', type: 'tags', label: 'Main dishes', renderAs: 'badge', showCountInHeader: true, countLabel: 'dish' },
    { key: 'secret', type: 'text', label: 'Internal', renderAs: 'hidden' },
  ],
})

export const GROCERY: CategoryConfig = makeCategory({
  id: 'grocery',
  label: 'Grocery',
  detailFields: [
    { key: 'hours', type: 'hours', label: 'Hours', renderAs: 'row' },
    { key: 'website', type: 'url', label: 'Website', renderAs: 'row' },
    { key: 'isKosher', type: 'select', label: 'Kosher Store', renderAs: 'badge', filterable: true, options: [{ label: 'Kosher Store', value: 'Kosher Store' }, { label: 'Kosher Items', value: 'Kosher Items' }] },
    { key: 'm', type: 'tags', label: 'Kosher items available', renderAs: 'badge', showCountInHeader: true, countLabel: 'kosher item', countReplacesKey: 'isKosher' },
  ],
})

export const MIKVAH: CategoryConfig = makeCategory({
  id: 'mikvah',
  label: 'Mikvah',
  detailFields: [
    { key: 'hours', type: 'hours', label: 'Hours', renderAs: 'row' },
    { key: 'website', type: 'url', label: 'Website', renderAs: 'row' },
    { key: 'e', type: 'text', label: 'Email', renderAs: 'row' },
    { key: 'womenTevillah', type: 'boolean', label: 'Women’s Tevillah', filterLabel: 'Women’s', renderAs: 'badge', filterable: true },
    { key: 'menTevillah', type: 'boolean', label: 'Men’s Tevillah', filterLabel: 'Men’s', renderAs: 'badge', filterable: true },
    { key: 'women_s_hours', type: 'hours', label: 'Women’s Hours', shortLabel: 'Hours', renderAs: 'row', audienceKey: 'womenTevillah' },
    { key: 'women_s_phone', type: 'tel', label: 'Women’s Phone', shortLabel: 'Phone', renderAs: 'row', audienceKey: 'womenTevillah' },
    { key: 'women_s_notes', type: 'textarea', label: 'Women’s Notes', shortLabel: 'Note', renderAs: 'row', audienceKey: 'womenTevillah' },
    { key: 'men_s_hours', type: 'hours', label: 'Men’s Hours', shortLabel: 'Hours', renderAs: 'row', audienceKey: 'menTevillah' },
  ],
})

export const SHUL: CategoryConfig = makeCategory({
  id: 'synagogue',
  label: 'Synagogue',
  detailFields: [
    { key: 'website', type: 'url', label: 'Website', renderAs: 'row' },
    { key: 'photo', type: 'image', label: 'Photo', renderAs: 'row' },
    { key: 'denomination', type: 'select', label: 'Denomination', renderAs: 'badge', filterable: true, options: [{ label: 'Orthodox (Sephardic)', value: 'Orthodox (Sephardic)' }, { label: 'Conservative', value: 'Conservative' }] },
    { key: 'minyanim', type: 'minyanim', label: 'Davening Times (Minyanim)', renderAs: 'row' },
  ],
})

export const HOSPITAL: CategoryConfig = makeCategory({
  id: 'hospital',
  label: 'Hospital',
  listingParts: {
    shabbos: { fields: ['eruv', 'sukkah'], after: 2 },
    boxes: [
      { title: 'Who to call', fields: ['liaisons'] },
      { title: 'Kosher food', fields: ['pantry', 'food_packages'] },
      { title: 'Rides', fields: ['transportation'] },
    ],
  },
  detailFields: [
    { key: 'hours', type: 'hours', label: 'Hours', renderAs: 'row' },
    { key: 'w', type: 'url', label: 'Website', renderAs: 'row' },
    { key: 'r', type: 'url', label: 'Refuah Link', renderAs: 'row' },
    { key: 'liaisons', type: 'contacts', label: 'Liaisons', renderAs: 'row' },
    { key: 'pantry', type: 'contacts', label: 'Pantry', renderAs: 'row' },
    { key: 'food_packages', type: 'contacts', label: 'Food packages', renderAs: 'row' },
    { key: 'transportation', type: 'contacts', label: 'Transportation', renderAs: 'row' },
    { key: 'eruv', type: 'select', label: 'Eruv', renderAs: 'row', options: [{ label: 'University City Eruv', value: 'University City Eruv' }] },
    { key: 'sukkah', type: 'textarea', label: 'Sukkah', renderAs: 'row' },
  ],
})
