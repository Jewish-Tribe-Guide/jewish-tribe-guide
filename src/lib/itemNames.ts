import { words } from './ask'

// ── Item names (build plan step 3: "a fixed list of item names") ───────────
// What a store carries is typed by whoever adds it, so one thing arrives
// under several names: "Sliced Cheeses" and "Some Sliced Cheese",
// "Premade Shabbat Meals" and "Prepared Shabbos Food", "Bakery" and "Baked
// Goods" were all in the guide on Oct 1. And a search names the kind of
// thing while a store names the thing: "fish" found no store, though two
// list Salmon; "cheese" missed the Brie.
//
// Each entry is one item: the name the guide uses for it, the other names
// people type (`aka`), and the kinds it belongs to (`kinds`), which a
// search for the kind finds. Ordinary food words, true in any community,
// like the spelling groups in ask.ts. A name not on the list is still an
// item, found by its own words as before.
//
// Kinds are kept to what's never wrong: salmon is a fish, brie a cheese.
// And never a word that's also a food place's type: "meat", "dairy" and
// "bakery" are Food's Meat, Dairy and Bakery, and as kinds they put grocery
// stores into "open meat keystone" and "dairy places open after 6" (the
// comparison, Oct 1: today's search alone went from 36 right to 33). Nor
// another name that adds one of those words: a deli's "Deli Meat" made
// "meat" find every store with a deli counter.

export type ItemName = {
  name: string
  aka?: string[]
  kinds?: string[]
}

export const ITEM_NAMES: ItemName[] = [
  // Bread and baked goods
  { name: 'Challah', aka: ['Challos', 'Challot', 'Challahs'], kinds: ['bread'] },
  { name: 'Pas Yisroel Bread', aka: ['Pas Yisroel'], kinds: ['bread'] },
  { name: 'Pretzel Buns', aka: ['Pretzel Rolls'], kinds: ['bread', 'rolls'] },
  { name: 'Baked Goods', aka: ['Bakery', 'Bakery Items', 'Baked Items'] },
  { name: 'Donuts', aka: ['Doughnuts'], kinds: ['baked goods'] },
  // Dairy
  { name: 'Chalav Yisroel Milk', aka: ['Chalav Yisroel', 'Cholov Yisroel Milk'], kinds: ['milk'] },
  { name: 'European Style Butter', aka: ['European Butter'], kinds: ['butter'] },
  { name: 'Cheese' },
  { name: 'Brie', aka: ['Brie Cheese'], kinds: ['cheese'] },
  { name: 'Camembert', aka: ['Camembert Cheese'], kinds: ['cheese'] },
  { name: 'Boursin', aka: ['Boursin Cheese'], kinds: ['cheese'] },
  { name: 'Cheddar Cheese', aka: ['Cheddar'], kinds: ['cheese'] },
  { name: 'Goat Cheese', aka: ['Chevre'], kinds: ['cheese'] },
  { name: 'Mozzarella Cheese', aka: ['Mozzarella'], kinds: ['cheese'] },
  { name: 'Shredded Cheese', aka: ['Grated Cheese'], kinds: ['cheese'] },
  { name: 'Sliced Cheese', aka: ['Sliced Cheeses', 'Some Sliced Cheese', 'Cheese Slices'], kinds: ['cheese'] },
  { name: 'Cheese Sticks', aka: ['String Cheese'], kinds: ['cheese'] },
  // Meat and poultry
  { name: 'Glatt Kosher Meat', aka: ['Glatt Meat'] },
  { name: 'Beef' },
  { name: 'Steak', kinds: ['beef'] },
  { name: 'Brisket', kinds: ['beef'] },
  { name: 'Chuck Roast', aka: ['Chuck'], kinds: ['beef', 'roast'] },
  { name: 'Stew Meat', aka: ['Stew Beef'], kinds: ['beef'] },
  { name: 'Hamburger Meat', aka: ['Ground Beef', 'Ground Meat', 'Chopped Meat', 'Hamburger'], kinds: ['beef'] },
  { name: 'Deli', aka: ['Cold Cuts', 'Cold Cut'] },
  { name: 'Butcher', aka: ['Butcher Counter', 'Butcher Shop'] },
  { name: 'Chicken', kinds: ['poultry'] },
  { name: 'Turkey', kinds: ['poultry'] },
  { name: 'Ground Turkey', kinds: ['poultry', 'turkey'] },
  { name: 'Chicken Broth', aka: ['Chicken Stock'], kinds: ['soup', 'broth'] },
  // Fish
  { name: 'Salmon', aka: ['Lox'], kinds: ['fish'] },
  { name: 'Fresh Fish Counter', aka: ['Fish Counter', 'Fresh Fish'], kinds: ['fish'] },
  // Prepared and frozen
  {
    name: 'Prepared Shabbos Food',
    aka: ['Premade Shabbat Meals', 'Premade Shabbos Meals', 'Prepared Shabbos Meals', 'Shabbos Meals', 'Shabbos Food', 'Shabbos Takeout'],
    kinds: ['prepared food', 'takeout'],
  },
  { name: 'Frozen Products', aka: ['Frozen Food', 'Frozen Foods', 'Frozen Items'], kinds: ['frozen'] },
  { name: 'Pizza Bagels', kinds: ['frozen'] },
  { name: 'Potato Pierogis', aka: ['Pierogis', 'Pierogi'], kinds: ['frozen'] },
  // Other
  { name: 'Wine', aka: ['Kosher Wine'], kinds: ['alcohol'] },
  { name: 'Marshmallows', aka: ['Marshmallow'] },
  { name: 'Noodles', aka: ['Pasta'] },
  { name: 'Oyster Sauce' },
  { name: 'Seitan' },
  { name: 'Tofu' },
  { name: 'Sushi' },
]

const key = (text: string) => words(text).join(' ')

const BY_NAME = new Map<string, ItemName>()
for (const entry of ITEM_NAMES) for (const n of [entry.name, ...(entry.aka ?? [])]) if (!BY_NAME.has(key(n))) BY_NAME.set(key(n), entry)

/** The list's entry for an item as a store has it, by its name or one of
 *  its other names, spelled any way (words() folds "Shabbat" to
 *  "Shabbos"). Undefined for an item not on the list. */
export function itemEntry(label: string): ItemName | undefined {
  return BY_NAME.get(key(label))
}

/** The name the guide uses for an item: "Some Sliced Cheese" is "Sliced
 *  Cheese". An item not on the list keeps its own. */
export function itemName(label: string): string {
  return itemEntry(label)?.name ?? label.trim()
}

/** Every word an item can be found by: its own, its other names', and its
 *  kinds' ("fish" for Salmon). Folded, as search compares them. */
export function itemWords(label: string): string[] {
  const entry = itemEntry(label)
  if (!entry) return words(label)
  return [...new Set([label, entry.name, ...(entry.aka ?? []), ...(entry.kinds ?? [])].flatMap(words))]
}

/** Whether the words asked for (folded) are this item, said whole: its
 *  name, one of its other names, or one of its kinds. "fish" is Salmon;
 *  "smoked fish" isn't, though it shares a word. Without its kinds,
 *  only its names. */
export function namesItem(terms: readonly string[], label: string, { kinds = true }: { kinds?: boolean } = {}): boolean {
  const entry = itemEntry(label)
  const said = [...terms].sort().join(' ')
  const ways = [label, ...(entry ? [entry.name, ...(entry.aka ?? []), ...(kinds ? (entry.kinds ?? []) : [])] : [])]
  return ways.some((w) => words(w).sort().join(' ') === said)
}
