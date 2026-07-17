// ── Your directory categories ────────────────────────────────────────────────
// THIS is the single place to choose the categories in your community's
// directory. Each entry below becomes a card on the home screen and a set of
// listings. To customize:
//
//   • Keep all, some, or none — delete any category block you don't want.
//   • Order — the cards show alphabetically by name. (`sort_order` is still
//     stored for a future manual-ordering option, but is not used today.)
//   • Tweak — change a category's label, icon (emoji), or its `fields`.
//   • Add your own — copy a block, give it a unique `id`, a label, an icon, and
//     the fields each listing should have (see the field types in use below).
//
// `npm run setup` seeds exactly what's here: the categories, their starter
// listings (from resources.js / synagogues.js, matched by category id), tags,
// and upvotes all follow this list — so any subset works out of the box.
// Communities can also add categories AFTER launch via the in-app
// "Suggest a new category" flow (an admin approves it at /admin).
//
// Field `renderAs`: 'badge' (chip near the name) | 'row' (labeled line) | 'hidden'.
// `filterable: true` adds a filter control for that field on the category page.

export const categories = [
  {
    id: 'grocery',
    label: 'Grocery Store',
    plural_label: 'Grocery Stores',
    icon: '🛒',
    description: 'Kosher and local grocery stores near the hospital',
    sort_order: 10,
    fields: [
      { key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row', filterable: true },
      { key: 'isKosher', label: 'Kosher', type: 'boolean', renderAs: 'badge', filterable: true, filterLabel: 'Kosher' },
      {
        key: 'kosherItems',
        label: 'Kosher items available',
        type: 'tags',
        tagGroup: 'kosher_product',
        renderAs: 'badge',
        help: 'Which kosher products can people find here?',
        showIf: { field: 'isKosher', equals: true },
      },
    ],
  },
  {
    id: 'restaurant',
    label: 'Food Establishment',
    plural_label: 'Food Establishments',
    icon: '🍽️',
    description: 'Kosher and nearby dining options',
    sort_order: 20,
    fields: [
      {
        key: 'foodType',
        label: 'Type',
        type: 'select',
        options: [
          { value: 'Restaurant', label: 'Restaurant' },
          { value: 'Bakery & Cafe', label: 'Bakery & Cafe' },
          { value: 'Ice Cream', label: 'Ice Cream' },
        ],
        renderAs: 'badge',
        filterable: true,
        filterLabel: 'Type',
        multiSelect: true,
      },
      { key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row', filterable: true },
      {
        key: 'kosherCert',
        label: 'Kosher Certification',
        type: 'select',
        options: [
          { value: 'IKC', label: 'IKC' },
          { value: 'Keystone-K', label: 'Keystone-K' },
          { value: 'Cherry-K', label: 'Cherry-K' },
          { value: 'OU', label: 'OU' },
          { value: 'Star-K', label: 'Star-K' },
          { value: 'OK Kosher', label: 'OK Kosher' },
          { value: 'cRc', label: 'cRc' },
          { value: 'Kof-K', label: 'Kof-K' },
          { value: 'Other Kosher', label: 'Other Kosher' },
        ],
        renderAs: 'badge',
        filterable: true,
        filterLabel: 'Kosher Cert',
        multiSelect: true,
        // When the place carries a hechsher but isn't entirely kosher, the cert
        // badge renders amber and shows the note explaining what isn't.
        caveat: { flagField: 'kosherPartial', noteField: 'kosherNote' },
      },
      {
        key: 'kosherPartial',
        label: 'Not everything here is kosher',
        type: 'boolean',
        renderAs: 'hidden',
        help: 'Check this if the establishment has a hechsher but some items/areas are not kosher.',
      },
      {
        key: 'kosherNote',
        label: 'What isn’t kosher?',
        type: 'textarea',
        renderAs: 'hidden',
        showIf: { field: 'kosherPartial', equals: true },
        placeholder: 'e.g. The dairy menu is certified; the meat counter is not under supervision.',
        help: 'Explain what isn’t kosher so observant visitors know what to verify.',
      },
      {
        key: 'dietary',
        label: 'Dietary options',
        type: 'tags',
        tagGroup: 'dietary_option',
        renderAs: 'badge',
        help: 'E.g. Vegan, Vegetarian, Gluten-free',
      },
      { key: 'menu', label: 'Menu', type: 'url', linkLabel: 'View menu', renderAs: 'row', placeholder: 'https://…' },
    ],
  },
  {
    id: 'hotel',
    label: 'Hotel',
    plural_label: 'Hotels',
    icon: '🏨',
    description: 'Lodging with shuttle and Shabbat-friendly options',
    sort_order: 30,
    fields: [
      { key: 'shabbatFriendly', label: 'Shabbat friendly', type: 'boolean', renderAs: 'badge', filterable: true, filterLabel: 'Shabbat friendly' },
      { key: 'shuttleAvailable', label: 'Shuttle available', type: 'boolean', renderAs: 'badge', filterable: true, filterLabel: 'Shuttle available' },
      { key: 'notes', label: 'Notes', type: 'textarea', renderAs: 'row', placeholder: 'Anything else worth knowing' },
    ],
  },
  {
    id: 'mikvah',
    label: 'Mikvah',
    plural_label: 'Mikvah',
    icon: '💧',
    description: 'Mikvah locations, hours, and contact information',
    sort_order: 40,
    fields: [
      // `hours` was formerly type:'text'; type:'hours' enables the Open Now filter.
      { key: 'hours', label: 'Hours', type: 'hours', renderAs: 'row', filterable: true },
      { key: 'womenTevillah', label: "Women's Tevillah", type: 'boolean', renderAs: 'badge', filterable: true, filterLabel: "Women's" },
      { key: 'menTevillah', label: "Men's Tevillah", type: 'boolean', renderAs: 'badge', filterable: true, filterLabel: "Men's" },
      { key: 'keilim', label: 'Keilim', type: 'boolean', renderAs: 'badge', filterable: true, filterLabel: 'Keilim' },
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp Group',
    plural_label: 'WhatsApp Groups',
    icon: '💬',
    description: 'Community WhatsApp groups to join',
    sort_order: 50,
    fields: [
      { key: 'description', label: 'Description', type: 'textarea', renderAs: 'row', hideLabel: true, placeholder: 'What is this group about?' },
      { key: 'link', label: 'Join group', type: 'url', linkLabel: 'Join group', renderAs: 'row', showInHeader: true },
    ],
  },
  {
    // Synagogues get a richer card (davening times). Starter shul data lives in
    // src/data/synagogues.js; remove this block to leave shuls out entirely.
    id: 'synagogue',
    label: 'Synagogue',
    plural_label: 'Synagogues',
    icon: '✡️',
    description: 'Nearby shuls with davening times, contacts, and WhatsApp groups',
    sort_order: 5,
    fields: [
      {
        key: 'denomination',
        label: 'Denomination',
        type: 'select',
        renderAs: 'badge',
        filterable: true,
        filterLabel: 'Denomination',
        options: [
          { value: 'Orthodox', label: 'Orthodox' },
          { value: 'Orthodox (Sephardic)', label: 'Orthodox (Sephardic)' },
          { value: 'Conservative', label: 'Conservative' },
          { value: 'Reform', label: 'Reform' },
          { value: 'Other', label: 'Other' },
        ],
      },
      {
        // Structured minyanim field — rendered by SynagogueCard, not GenericDirectory.
        key: 'minyanim',
        label: 'Davening Times (Minyanim)',
        type: 'minyanim',
        renderAs: 'hidden',
      },
      {
        key: 'whatsapp',
        label: 'WhatsApp Group',
        type: 'url',
        linkLabel: 'Join WhatsApp',
      },
    ],
  },
]

/** Set of the selected category ids — used by the seed scripts to skip content
 *  (listings, synagogues) whose category you removed above. */
export const categoryIds = new Set(categories.map((c) => c.id))
