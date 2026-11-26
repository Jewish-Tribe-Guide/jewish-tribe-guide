import { describe, expect, it } from 'vitest'
import { starterRows, type StarterSource } from './starterPack'

// Shaped like Philly's rows on the live site (Nov 25).
const page = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind,
  community_id: 'philly',
  plural_label: id,
  active: true,
  fields: [],
  created_at: '2026-07-21T00:00:00Z',
  card_image_url: `https://photos/${id}.jpg`,
  card_band_image_url: `https://photos/${id}-band.jpg`,
  icon_image_url: null,
  walk_list: null,
  external_link_url: null,
  external_link_label: null,
  ...extra,
})

const source = (over: Partial<StarterSource> = {}): StarterSource => ({
  region: 'Philadelphia',
  categories: [
    page('synagogue', 'listing'),
    page('restaurant', 'listing', {
      fields: [
        { key: 't', type: 'select', label: 'Food Type', options: [{ label: 'Meat', value: 'Meat' }] },
        { key: 'kosherCert', type: 'select', label: 'Kosher Certification', options: [{ label: 'Keystone-K', value: 'Keystone-K' }] },
      ],
    }),
    page('grocery', 'listing'),
    page('mikvah', 'listing', { external_link_url: 'https://mikvah.org/directory/philadelphia?lat=39.95', external_link_label: 'Find a mikvah' }),
    page('school', 'listing'),
    page('hospital', 'listing'),
    page('hotel', 'listing'),
    page('eruv-information', 'eruv'),
    page('zmanim', 'zmanim'),
    page('map', 'map'),
    page('medical', 'medical', { active: false }),
    page('integration-test-06e60c27', 'listing'),
  ],
  sections: [
    { id: 'featured', kind: 'featured', community_id: 'philly', card_ids: [], created_at: 'x' },
    { id: 'listings', kind: 'listings', community_id: 'philly', card_ids: [] },
    { id: 'zmanim', kind: 'zmanim', community_id: 'philly', card_ids: [] },
    { id: 'food-establishments', kind: 'section', title: 'Food and Hospitality', community_id: 'philly', card_ids: ['restaurant', 'grocery', 'hotel'] },
    { id: 'jewish-institutions', kind: 'section', community_id: 'philly', card_ids: ['synagogue', 'zmanim', 'mikvah', 'eruv-information'] },
    { id: 'family-resources', kind: 'section', community_id: 'philly', card_ids: ['childcare', 'school', 'cemetery'] },
    { id: 'medical-resources', kind: 'section', community_id: 'philly', card_ids: ['hospital'] },
    { id: 'rightNow', kind: 'rightNow', community_id: 'philly', card_ids: [] },
    { id: 'suggest', kind: 'suggest', community_id: 'philly', card_ids: [] },
    { id: 'subscribe', kind: 'subscribe', community_id: 'philly', card_ids: [] },
  ],
  settings: {
    id: 'default',
    community_id: 'philly',
    name: 'Philadelphia Jewish Community',
    mission: 'A guide to Jewish Philadelphia',
    logo_url: 'https://photos/logo.webp',
    desktop_hero_image: 'https://photos/hero.jpg',
    desktop_map_image: 'https://photos/map.jpg',
    desktop_hero_headline: 'Your Guide to Jewish Philadelphia',
    search_placeholder: 'Ask: challah, pizza open now',
    mobile_tabs: [{ id: 'categories', label: 'Home', target: 'categories' }, { id: 'tab_x', label: 'Activity', target: 'changes' }],
    right_now_categories: ['restaurant', 'hotel'],
    featured_card_ids: ['hotel'],
  },
  tags: [{ id: 'u1', slug: 'challah', label: 'Challah', group: 'dishes', community_id: 'philly', created_at: 'x' }],
  ...over,
})

const target = { slug: 'baltimore', name: 'Baltimore Jewish Guide', region: 'Baltimore', mission: 'A guide to Jewish Baltimore' }

describe('starterRows', () => {
  it('copies the pack’s pages only: the four listing pages, Candle Lighting, the Map and the Eruv', () => {
    const { categories } = starterRows(source(), target)
    expect(categories.map((c) => c.id).sort()).toEqual(['eruv-information', 'grocery', 'map', 'mikvah', 'restaurant', 'synagogue', 'zmanim'])
    expect(categories.every((c) => c.community_id === 'baltimore' && !('created_at' in c))).toBe(true)
  })

  it('clears the default city’s own: photos, the outside link and the hechshers', () => {
    const { categories } = starterRows(source(), target)
    for (const c of categories) {
      expect(c.card_image_url).toBeNull()
      expect(c.card_band_image_url).toBeNull()
      expect(c.external_link_url).toBeNull()
    }
    const food = categories.find((c) => c.id === 'restaurant')!
    const fields = food.fields as { key: string; options: unknown[] }[]
    expect(fields.find((f) => f.key === 'kosherCert')!.options).toEqual([])
    // Meat, Dairy and the like stay: they're the same everywhere.
    expect(fields.find((f) => f.key === 't')!.options).toEqual([{ label: 'Meat', value: 'Meat' }])
  })

  it('keeps the home’s groups with the pack’s tiles, and drops a group left empty and rows nothing draws', () => {
    const { sections } = starterRows(source(), target)
    expect(sections.map((s) => s.id)).toEqual(['food-establishments', 'jewish-institutions', 'rightNow', 'suggest', 'subscribe'])
    expect(sections.find((s) => s.id === 'food-establishments')!.card_ids).toEqual(['restaurant', 'grocery'])
    expect(sections.every((s) => s.community_id === 'baltimore')).toBe(true)
  })

  it('copies the tabs and words in the new city’s name, never the logo or photos', () => {
    const { settings } = starterRows(source(), target)
    expect(settings).toMatchObject({
      community_id: 'baltimore',
      name: 'Baltimore Jewish Guide',
      mission: 'A guide to Jewish Baltimore',
      desktop_hero_headline: 'Your Guide to Jewish Baltimore',
      search_placeholder: 'Ask: challah, pizza open now',
      mobile_tabs: source().settings!.mobile_tabs,
      right_now_categories: ['restaurant'],
    })
    expect(settings).not.toHaveProperty('logo_url')
    expect(settings).not.toHaveProperty('desktop_hero_image')
    expect(settings).not.toHaveProperty('desktop_map_image')
    expect(settings).not.toHaveProperty('featured_card_ids')
  })

  it('copies the food words as new rows of the new community, not the default’s ids', () => {
    const { tags } = starterRows(source(), target)
    expect(tags).toEqual([{ slug: 'challah', label: 'Challah', group: 'dishes', community_id: 'baltimore' }])
  })

  it('swaps the city only as a whole word', () => {
    const { settings } = starterRows(source({ region: 'York', settings: { desktop_hero_headline: 'Jewish York and New York' } }), { ...target, region: 'Boston' })
    // "New York" has York as a word too; it's the region, written the same.
    expect(settings!.desktop_hero_headline).toBe('Jewish Boston and New Boston')
    const plain = starterRows(source({ region: 'Ark', settings: { desktop_hero_headline: 'Arkansas' } }), target)
    expect(plain.settings!.desktop_hero_headline).toBe('Arkansas')
  })

  it('starts with no settings row when the default has none, and leaves a hidden page behind', () => {
    const rows = starterRows(source({ settings: null, categories: [page('grocery', 'listing', { active: false })] }), target)
    expect(rows.settings).toBeNull()
    expect(rows.categories).toEqual([])
  })
})
