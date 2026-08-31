import type { CategoryConfig } from '@/lib/categories'
import type { Community } from '@/lib/communityStore'
import type { CommunityContent } from '@/lib/loadCommunityContent'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import type { DirectoryResource } from '@/types'

// ── Fixture builders for tests that render components needing ContentProvider
// / CommunityProvider — see renderWithProviders.tsx. Each takes a partial
// override so a test only spells out the field(s) it actually cares about,
// same pattern as CategoryEditor.test.tsx's baseCategory(). ──

export function makeCategory(overrides: Partial<CategoryConfig> = {}): CategoryConfig {
  return {
    id: 'grocery',
    label: 'Grocery Store',
    pluralLabel: 'Grocery Stores',
    icon: '🛒',
    description: '',
    detailFields: [],
    kind: 'listing',
    ...overrides,
  }
}

export function makeCommunity(overrides: Partial<Community> = {}): Community {
  return {
    slug: 'test-community',
    name: 'Test Community',
    shortName: 'Test',
    tagline: 'A test community',
    mission: '',
    manifestDescription: '',
    region: 'Test Region',
    timezone: 'America/New_York',
    mapCenter: { lat: 0, lng: 0 },
    themeColor: '#000000',
    backgroundColor: '#ffffff',
    features: {},
    ui: {},
    sortOrder: 0,
    isDefault: true,
    visible: true,
    ...overrides,
  }
}

export function makeContent(overrides: Partial<CommunityContent> = {}): CommunityContent {
  return {
    categories: [makeCategory()],
    settings: SITE_SETTINGS_DEFAULTS,
    homeSections: [],
    forms: [],
    hospitals: [],
    failed: [],
    ...overrides,
  }
}

export function makeListing(overrides: Partial<DirectoryResource> = {}): DirectoryResource {
  return {
    id: 'listing-1',
    category: 'grocery',
    name: 'Test Grocery',
    anchorId: 'community',
    distance: 1,
    address: '123 Main St, Test City, TS 00000',
    ...overrides,
  }
}
