// What the starter pack holds (Nov 25, board 2f), apart from the copying
// (starterPack.ts, server only), so New community's screen can name it.

/** The listing pages in the pack, by the default community's ids. */
export const STARTER_LISTING_IDS = ['synagogue', 'restaurant', 'grocery', 'mikvah'] as const

/** Pages that come by kind, whatever their id. */
export const STARTER_KINDS = ['zmanim', 'map', 'eruv'] as const

/** The pack's pages as New community lists them, in the board's order. */
export const STARTER_PACK_NAMES = ['Synagogues', 'Food', 'Grocery', 'Mikvah', 'Eruv', 'Candle Lighting', 'Map'] as const
