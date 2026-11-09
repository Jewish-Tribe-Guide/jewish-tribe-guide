import { pickableOptions, type CategoryField, type FieldType } from './categories'
import { partnerRule } from './fieldPartners'

// What a ready-made field is, in a few plain sentences: the first box on its
// screen, before adding it and after (canvas row "Each kind of field", Nov 7).
// The user, Nov 7: a field's screen should feel like a shop listing, so you
// see what you're getting first and what you can change second.
//
// Written paragraphs are drafts, by the field's name and kind, the same
// identity the ready-made list uses (readyMade.ts's fieldId). The user means
// to go through every field and settle these. A field without one is
// described by its kind, from what it really does.

export type FieldAbout = {
  /** Two to four sentences: what it is, what people fill in, what visitors see. */
  about: string
  /** A choice field's choices, as visitors are offered them. */
  choices?: string[]
  /** The parts it comes with (Davening times). */
  comesWith?: string[]
  /** The watches that can keep it up to date, when any can. */
  watchedBy?: string[]
}

const norm = (s: string) => s.trim().toLowerCase()
const idOf = (f: Pick<CategoryField, 'label' | 'type'>) => `${f.type === 'textarea' ? 'text' : f.type}:${norm(f.label)}`

const WRITTEN: Record<string, string> = {
  'boolean:shabbat friendly': 'Whether a place works over Shabbos: keys, an elevator, a walk to shul. People adding a place answer Yes or No. A place marked Yes says so on its row and its listing.',
  'tags:kosher items available': 'The kosher food a place keeps, item by item. People adding a place type in each item, and can mark one that isn’t always in stock. Rows name a few, and the listing shows them all in a box.',
  'tags:main dishes': 'What a place serves, dish by dish. People adding a place type in each dish, and can mark one that isn’t always on the menu. Rows name a few, and the listing shows them all in a box.',
  'text:delivery details': 'Where a place delivers, and when. People adding a place write it in their own words. The listing shows it under About.',
  'url:join group': 'A button that opens a group’s invite link. People adding a place paste the link. The listing shows a Join group button.',
  'hours:hours': 'When a place is open, day by day. People adding a place set the open and closed times for each day. Rows say “Open until 8 PM” or “Closed now”.',
  'contacts:liaisons': 'Who to call at a place, and what for. People adding a place add each person: a name, what they help with, a phone and an email. The listing shows them in a box.',
  'minyanim:davening times (minyanim)': 'When the minyanim are. People adding a place fill in the usual weekday times, the usual Shabbos times, and this week’s schedule when it’s different. The listing shows each in a box of its own.',
  'image:photo': 'A photo of the place. People adding a place upload one. It shows on the place’s row and at the top of its listing.',
  'select:denomination': 'Which movement a place belongs to. People adding a place pick one, or type another. Rows show it under the name.',
  'select:food type': 'Whether a place is meat, dairy or parve. People adding a place pick one. Rows show it under the name.',
  'text:address': 'Where the place is. People adding a place type the address. It puts the place on the map, and the listing shows Directions.',
  'tel:phone': 'The place’s phone number. People adding a place type it. The listing shows a Call button.',
  // The user, Nov 9: what these are, in their words or close to them.
  'select:kosher store': 'Whether a store is fully kosher, or isn’t but carries some kosher items. Mostly for grocery stores. People adding a store pick one. Rows show it under the name.',
  'select:services': 'What kind of care a place gives: early childhood, or after school. People adding a place pick one. Rows show it under the name.',
  'select:size': 'How big a sukkah is: small, medium or large. People adding a sukkah pick one. Rows show it under the name.',
  'select:store type': 'What kind of food place it is: a restaurant, a bakery, ice cream, catering or a food truck. Scheduled Deliveries is a place from out of town that brings group orders in. People adding a place pick any that fit. Rows show it under the name.',
  'boolean:keilim': 'Whether a mikvah has a keilim mikvah, for toveling dishes and utensils. People adding a mikvah answer Yes or No. A mikvah marked Yes shows it on its row and listing.',
  "boolean:men's tevillah": 'Whether men can use the mikvah. People adding a mikvah answer Yes or No. A mikvah marked Yes shows it on its row and listing.',
  "boolean:women's tevillah": 'Whether women can use the mikvah for tevillah. People adding a mikvah answer Yes or No. A mikvah marked Yes shows it on its row and listing, with its own section for the women’s hours, phone and email.',
  'text:email': 'The place’s email address. People adding a place type it in. The listing shows it.',
  'text:short description': 'A few words about a place, shown under its name on its row. People adding a place write it in, up to 27 letters.',
  'text:women’s email': 'The email for a mikvah’s women’s side, for appointments and questions. People adding a mikvah type it in. The listing shows it in the women’s section.',
  'url:website': 'The place’s own website. People adding a place paste the address. The listing shows a button that opens it.',
}

/** What a ready-made field lets a page change beyond its kind's switches,
 *  and what it doesn't. The user settles these field by field (Nov 8). */
export type FieldRules = {
  /** Its choices are the community's (the user, Nov 9: "some fields have no
   *  edit and some have edit. If you can edit then you can fully edit"):
   *  rename, remove, reorder, add, and Other. Every other ready-made
   *  field's choices are the same everywhere and can't be changed. */
  choicesEditable?: boolean
  /** "Everything here is kosher?" can be turned off and on. */
  asksEverythingKosher?: boolean
}

// Hechshers and eruvim are local (the user, Nov 5). Childcare services
// vary by community too, and nothing reads their values (decided Nov 9).
const RULES: Record<string, FieldRules> = {
  'select:kosher certification': { choicesEditable: true, asksEverythingKosher: true },
  'select:eruv': { choicesEditable: true },
  'select:services': { choicesEditable: true },
}

export const fieldRules = (f: Pick<CategoryField, 'label' | 'type'>): FieldRules => RULES[idOf(f)] ?? {}

/** Paragraphs that follow what a page has switched on. */
const WRITTEN_BY_SETTINGS: Record<string, (f: CategoryField) => string> = {
  'select:kosher certification': (f) =>
    `Which hechsher a place is under. ${kindHow(f)}${f.caveat ? ' They also say whether everything there is kosher. When it isn’t, they say what isn’t, and the listing shows that in a box of its own.' : ''}`,
}

const KIND_LEAD: Record<FieldType, string> = {
  boolean: 'A yes or no.',
  select: 'One of a set of choices.',
  tags: 'A list.',
  text: 'A line of text.',
  textarea: 'Text, as long as it needs to be.',
  url: 'A link.',
  tel: 'A phone number.',
  hours: 'Open and closed times, day by day.',
  image: 'A photo of the place.',
  minyanim: 'When the minyanim are.',
  contacts: 'People to call.',
  number: 'A number.',
}

/** How people fill it in, and what visitors see, by its kind and settings. */
function kindHow(f: CategoryField): string {
  switch (f.type) {
    case 'boolean':
      return 'People adding a place answer Yes or No.'
    case 'select':
      return `People adding a place pick ${f.multiSelect ? 'any that fit' : 'one'}${f.allowOther ? ', or type another' : ''}.`
    case 'tags':
      return f.showCountInHeader
        ? 'People adding a place type in each one. Rows name a few, and the listing shows them all in a box.'
        : 'People adding a place type in each one.'
    case 'text':
    case 'textarea':
      return f.showInHeader ? 'People adding a place write it in. It shows as a line under the name.' : 'People adding a place write it in their own words.'
    case 'url':
      return `People adding a place paste the link. The listing shows a button${f.linkLabel ? ` that says “${f.linkLabel}”` : ' that opens it'}.`
    case 'tel':
      return 'People adding a place type the number. The listing shows it with the place’s other contacts.'
    case 'hours':
      return 'People adding a place set the open and closed times for each day.'
    case 'image':
      return 'People adding a place upload one.'
    case 'minyanim':
      return 'People adding a place fill in the usual weekday times, the usual Shabbos times, and this week’s schedule.'
    case 'contacts':
      return 'People adding a place add each person: a name, what they help with, a phone and an email.'
    case 'number':
      return 'People adding a place type it in.'
  }
}

// What can keep a field up to date (the user, Nov 9: an admin should know
// which fields a watch can look after). The same jobs Add a place names for
// each row (src/components/admin/addSources.ts); whether one runs for a page
// is that page's setup on Watches.
// Each says what it needs, so an admin can tell what to do (the user,
// Nov 9: "how do I enable that?"). The jobs are on for every community
// unless turned off on Watches; what a place needs is set in Places.
const GOOGLE = 'Google, for places found on Google'
const LINK_CHECK = 'A weekly check that the link still works'
const SITE = 'The place’s website, once its page is added in Places'
const WATCHED: Record<string, string[]> = {
  'select:kosher certification': ['Keystone-K’s list', 'Mekor Habracha’s list', 'KCL’s list'],
  'url:kosher certification url': ['Keystone-K’s list', 'Mekor Habracha’s list', LINK_CHECK],
  'tags:main dishes': ['Its menu, once its menu link is added in Places'],
  'tel:phone': [GOOGLE],
  'url:website': [GOOGLE, LINK_CHECK],
}

function watchedBy(f: CategoryField): string[] | undefined {
  const written = WATCHED[idOf(f)]
  if (written) return written
  if (f.type === 'hours') return [GOOGLE, SITE]
  if (f.type === 'minyanim') return [SITE, 'The shul’s emails, once they’re signed up for in Places']
  if (f.type === 'contacts') return ['Refuah, for hospitals on Refuah']
  if (f.type === 'url') return [LINK_CHECK]
  return undefined
}

/** The choices a page starts with: its own (added here) are the page's. */
export function fixedChoices(f: CategoryField): string[] {
  return pickableOptions(f).filter((o) => !o.own).map((o) => o.label)
}

/** `partnerOn`: the field that comes with it (fieldPartners.ts) is on. */
export function fieldAbout(f: CategoryField, { partnerOn = false }: { partnerOn?: boolean } = {}): FieldAbout {
  const about = WRITTEN[idOf(f)] ?? WRITTEN_BY_SETTINGS[idOf(f)]?.(f) ?? `${KIND_LEAD[f.type]} ${kindHow(f)}`
  const watched = watchedBy(f)
  const partner = partnerOn ? partnerRule(f)?.name : undefined
  // A hechsher comes with whether everything there is kosher, and if not,
  // what isn't: two questions the listing shows as one box of its own.
  const caveat = f.type === 'select' && f.caveat ? ['Everything here is kosher?', f.caveat.title?.trim() || 'What isn’t kosher'] : []
  const parts = f.type === 'minyanim' ? ['Usual weekday times', 'Usual Shabbos times', 'This week’s schedule'] : []
  const comesWith = [...parts, ...caveat, ...(partner ? [partner] : [])]
  return {
    about,
    // A list the page can change is shown as that list, under What you can
    // change, so only a locked one is listed here.
    ...(f.type === 'select' && !(f.madeHere || fieldRules(f).choicesEditable) && { choices: [...fixedChoices(f), ...(f.allowOther ? ['Other, typed in'] : [])] }),
    ...(comesWith.length && { comesWith }),
    ...(watched && { watchedBy: watched }),
  }
}

/** A page's basics (Address, Phone, Hours, Website) aren't fields of their
 *  own until added; this is what they are, to describe. */
export function basicField(kind: 'address' | 'phone' | 'hours' | 'website'): CategoryField {
  if (kind === 'address') return { key: 'address', label: 'Address', type: 'text' }
  if (kind === 'phone') return { key: 'phone', label: 'Phone', type: 'tel' }
  if (kind === 'hours') return { key: 'hours', label: 'Hours', type: 'hours' }
  return { key: 'website', label: 'Website', type: 'url' }
}
