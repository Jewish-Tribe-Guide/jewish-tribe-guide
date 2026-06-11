import type { Audience, AppMode } from '@/types'
import type { CategoryConfig } from '@/lib/categories'

/** A place the search bar can send you — every page/form in the app, tagged
 *  with the words people actually type when they're looking for it. */
export type Destination = {
  id: string
  icon: string
  title: string
  description: string
  audience: Audience
  mode: AppMode
  extra?: Record<string, unknown>
  keywords: string[]
}

const STATIC_DESTINATIONS: Destination[] = [
  {
    id: 'meals',
    icon: '🍽️',
    title: 'Request Kosher Meals',
    description: 'Home-cooked kosher meals delivered to you or your family.',
    audience: 'patient',
    mode: 'assist',
    extra: { assistView: 'Meals' },
    keywords: [
      'meal', 'meals', 'food', 'kosher', 'kosher food', 'dinner', 'lunch', 'breakfast',
      'eat', 'hungry', 'meal train', 'food delivery', 'cholent', 'shabbos food',
      'shabbat meals', 'cooking', 'groceries', 'hechsher', 'cholov yisroel',
    ],
  },
  {
    id: 'transportation',
    icon: '🚗',
    title: 'Request Transportation',
    description: 'Rides to and from the hospital, arranged by neighbors.',
    audience: 'patient',
    mode: 'assist',
    extra: { assistView: 'Transportation' },
    keywords: [
      'ride', 'rides', 'car', 'drive', 'driver', 'lift', 'transport', 'transportation',
      'taxi', 'uber', 'pickup', 'drop off', 'appointment', 'travel', 'carpool',
      'get to the hospital', 'discharge', 'airport',
    ],
  },
  {
    id: 'family-housing',
    icon: '🏠',
    title: 'Request Family Housing',
    description: 'A nearby place to stay while your loved one is in care.',
    audience: 'patient',
    mode: 'assist',
    extra: { assistView: 'Family Housing' },
    keywords: [
      'housing', 'house', 'stay', 'sleep', 'room', 'spare room', 'apartment', 'lodging',
      'accommodation', 'accommodations', 'overnight', 'out of town', 'place to stay',
      'shabbos stay', 'near the hospital', 'guest room', 'host family',
    ],
  },
  {
    id: 'visitors',
    icon: '🤝',
    title: 'Request Visitors',
    description: 'A friendly face at the bedside for you or your loved one.',
    audience: 'patient',
    mode: 'assist',
    extra: { assistView: 'Request Visitors' },
    keywords: [
      'visit', 'visitor', 'visitors', 'company', 'lonely', 'bikur cholim',
      'someone to talk to', 'friendly face', 'sit with', 'patient visit', 'cheer up',
      'minyan at bedside', 'chavrusa',
    ],
  },
  {
    id: 'direct-support',
    icon: '✨',
    title: 'Request Direct Support',
    description: 'Not sure where to start? A community representative will reach out.',
    audience: 'patient',
    mode: 'assist',
    extra: { assistView: 'intake' },
    keywords: [
      'help', 'support', 'assistance', 'direct support', 'not sure', 'representative',
      'case manager', 'social worker', 'multiple services', 'talk to someone',
      'contact', 'emergency', 'crisis', 'anything', 'other',
    ],
  },
  {
    id: 'about-hospital',
    icon: '🏥',
    title: 'About Your Hospital',
    description: 'Chaplains, kosher food, prayer space, and Shabbat info.',
    audience: 'patient',
    mode: 'find',
    extra: { findView: 'about-hospital' },
    keywords: [
      'hospital', 'chaplain', 'rabbi', 'prayer room', 'prayer space', 'shabbat elevator',
      'shabbos elevator', 'kosher cafeteria', 'jewish doctor', 'medical staff',
      'bikur cholim room', 'shabbos accommodations', 'hup', 'penn', 'jefferson',
      'chop', 'temple', 'einstein',
    ],
  },
  {
    id: 'zmanim',
    icon: '🕯️',
    title: 'Zmanim & Shabbos Times',
    description: 'Hebrew date, candle lighting, and havdalah times.',
    audience: 'patient',
    mode: 'find',
    extra: { findView: 'zmanim' },
    keywords: [
      'zmanim', 'zman', 'candle lighting', 'candles', 'havdalah', 'shabbat times',
      'shabbos', 'shabbat', 'sunset', 'sunrise', 'shkia', 'netz', 'hebrew date',
      'davening times', 'shema', 'mincha', 'maariv', 'shacharis', 'parsha', 'molad',
    ],
  },
  {
    id: 'eruv',
    icon: '🗺️',
    title: 'Eruv Information',
    description: 'Eruv status, maps, and contacts for Shabbat.',
    audience: 'patient',
    mode: 'find',
    extra: { findView: 'eruv' },
    keywords: [
      'eruv', 'carry', 'carrying', 'eruv map', 'eruv status', 'eruv hotline',
      'shabbat boundary', 'techum', 'stroller on shabbos',
    ],
  },
  {
    id: 'directory',
    icon: '📚',
    title: 'All Resources',
    description: 'Synagogues, mikvahs, hotels, and everything else nearby.',
    audience: 'patient',
    mode: 'find',
    keywords: [
      'resources', 'directory', 'browse', 'synagogue', 'shul', 'minyan', 'davening',
      'mikvah', 'mikveh', 'kosher restaurant', 'restaurant', 'grocery', 'hotel',
      'whatsapp', 'community groups', 'pharmacy', 'near me', 'map', 'tehillim',
    ],
  },
  {
    id: 'volunteer',
    icon: '❤️',
    title: 'Volunteer Sign-Up',
    description: 'Tell us how you’d like to help. We’ll match you up.',
    audience: 'community',
    mode: 'give',
    keywords: [
      'volunteer', 'volunteering', 'help out', 'give', 'give back', 'chesed', 'mitzvah',
      'cook for a family', 'host', 'drive patients', 'donate time', 'sign up',
      'get involved', 'community service', 'tzedakah', 'lend a hand',
    ],
  },
  {
    id: 'volunteer-manage',
    icon: '✏️',
    title: 'Manage Volunteer Sign-Up',
    description: 'Update your availability or pause your volunteering.',
    audience: 'community',
    mode: 'give',
    extra: { volunteerView: 'edit' },
    keywords: [
      'edit volunteer', 'update volunteer', 'change availability', 'cancel volunteer',
      'stop volunteering', 'my signup', 'remove me', 'unsubscribe',
    ],
  },
]

// Keywords for DB-backed categories are derived from their label + description,
// so newly added categories are searchable without touching this file.
function categoryDestination(c: CategoryConfig): Destination {
  const words = `${c.pluralLabel} ${c.description}`
    .toLowerCase()
    .split(/[^a-z'’]+/)
    .filter((w) => w.length >= 3)
  return {
    id: `category-${c.id}`,
    icon: c.icon,
    title: c.pluralLabel,
    description: c.description,
    audience: 'patient',
    mode: 'find',
    extra: { findView: c.id },
    keywords: [...new Set([c.id.replaceAll('-', ' '), ...words])],
  }
}

export function buildDestinations(categories: CategoryConfig[]): Destination[] {
  return [...STATIC_DESTINATIONS, ...categories.map(categoryDestination)]
}

// Every typed word must match the title, a keyword, or the description (AND
// across words); results are ordered by how strong the matches are.
export function searchDestinations(destinations: Destination[], query: string): Destination[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []

  const scored: { d: Destination; score: number }[] = []
  for (const d of destinations) {
    const title = d.title.toLowerCase()
    const description = d.description.toLowerCase()
    let total = 0
    for (const t of tokens) {
      let best = 0
      if (title.startsWith(t)) best = 100
      else if (title.includes(t)) best = 80
      for (const k of d.keywords) {
        if (best >= 80) break
        if (k === t) best = Math.max(best, 75)
        else if (k.startsWith(t)) best = Math.max(best, 60)
        else if (t.length >= 3 && k.includes(t)) best = Math.max(best, 40)
      }
      if (best === 0 && t.length >= 3 && description.includes(t)) best = 20
      if (best === 0) {
        total = 0
        break
      }
      total += best
    }
    if (total > 0) scored.push({ d, score: total })
  }

  return scored.sort((a, b) => b.score - a.score).map((s) => s.d)
}
