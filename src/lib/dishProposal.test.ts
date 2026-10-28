import { describe, expect, it } from 'vitest'
import { dishProposal, listedAlready, readerMarks, sameDish } from './dishProposal'

const dish = (name: string, quote = name.toUpperCase()) => ({ name, quote, checked: true, named: true })

describe('dishProposal', () => {
  // Charlie was a sinner. on dev, Oct 21: its menu names 9 of the 12 dishes
  // its listing has, each found on its menu by an earlier read.
  const listed = {
    dishes: ['Sliders', 'Tacos', 'Fried Calamari', 'Tofu', 'Zucchini Crabcake Slider', 'Beets'],
    menuDated: ['Sliders', 'Tacos', 'Fried Calamari', 'Tofu', 'Zucchini Crabcake Slider', 'Beets'],
  }

  it('crosses out a dish a reader found before that the menu no longer names, and Use this takes it off', () => {
    const p = dishProposal(listed, { dishes: [dish('Sliders'), dish('Tacos'), dish('Beets')], missing: ['Fried Calamari', 'Tofu', 'Zucchini Crabcake Slider'] })
    expect(p.rows.map((r) => [r.name, r.status])).toEqual([
      ['Fried Calamari', 'gone'],
      ['Tofu', 'gone'],
      ['Zucchini Crabcake Slider', 'gone'],
      ['Sliders', 'same'],
      ['Tacos', 'same'],
      ['Beets', 'same'],
    ])
    expect(p.always).toEqual(['Sliders', 'Tacos', 'Beets'])
    expect(p.updates).toBe(3)
    expect(p.pill).toBe('3 not on the menu')
  })

  it('never crosses out a dish added by hand: the reader missed it once, so missing it again says nothing', () => {
    const p = dishProposal({ dishes: ['Sliders', 'Laffa Wraps'], menuDated: ['Sliders'] }, { dishes: [dish('Sliders')], missing: ['Laffa Wraps'] })
    expect(p.rows.find((r) => r.name === 'Laffa Wraps')?.status).toBe('not_found')
    expect(p.always).toEqual(['Sliders', 'Laffa Wraps'])
    expect(p.updates).toBe(0)
    expect(p.pill).toBeNull()
  })

  it('highlights a new dish, adds it at the end, and names the kind on the pill', () => {
    const p = dishProposal({ dishes: ['Sliders'], menuDated: ['Sliders'] }, { dishes: [dish('Sliders'), dish('Kofta', 'TURKISH "LAMB" KOFTA')], missing: [] })
    expect(p.rows.find((r) => r.name === 'Kofta')).toMatchObject({ status: 'new', quote: 'TURKISH "LAMB" KOFTA' })
    expect(p.always).toEqual(['Sliders', 'Kofta'])
    expect(p.pill).toBe('1 new')
  })

  it('says "N updates" when it both adds and takes off', () => {
    const p = dishProposal(listed, { dishes: [dish('Sliders'), dish('Kofta')], missing: ['Tacos', 'Fried Calamari', 'Tofu', 'Zucchini Crabcake Slider', 'Beets'] })
    expect(p.pill).toBe('6 updates')
  })

  it('keeps what the reading didn’t look for, and a dish in "not always" where it was', () => {
    const p = dishProposal({ dishes: ['Sliders', 'Soup'], sometimes: ['Soup'], menuDated: ['Sliders', 'Soup'] }, { dishes: [dish('Sliders')] })
    expect(p.rows.find((r) => r.name === 'Soup')?.status).toBe('unchecked')
    expect(p.always).toEqual(['Sliders'])
    expect(p.sometimes).toEqual(['Soup'])
    expect(p.updates).toBe(0)
  })

  it('matches names whatever their case, keeping the listing’s spelling', () => {
    const p = dishProposal({ dishes: ['Bao Buns'], menuDated: ['Bao Buns'] }, { dishes: [dish('bao buns')], missing: [] })
    expect(p.rows).toEqual([expect.objectContaining({ name: 'Bao Buns', status: 'same' })])
    expect(p.always).toEqual(['Bao Buns'])
  })
})

// The user, Oct 26: "what I really want is to see or know if the AI reader
// is picking things up that was added." Espresso Cafe on production: Bagels
// added by hand after its menu was read on Oct 22, never looked for since.
describe('readerMarks', () => {
  const listed = { dishes: ['Salads', 'Pizza', 'Bagels', 'Babka', 'Kugel'], menuDated: ['Salads', 'Pizza'] }

  it('marks each dish no read has found yet: named, looked for and not found, or not looked for', () => {
    const marks = readerMarks(listed, { dishes: [dish('Salads'), dish('Pizza'), dish('Bagels')], missing: ['Babka'] })
    expect([...marks]).toEqual([
      ['Bagels', 'on_menu'],
      ['Babka', 'not_found'],
      ['Kugel', 'not_looked'],
    ])
  })

  it('a dish found on its menu before is marked only when the last read looked and didn’t find it', () => {
    expect(readerMarks(listed, { dishes: [dish('Salads')], missing: ['Pizza'] }).get('Pizza')).toBe('not_found')
    expect(readerMarks(listed, { dishes: [dish('Salads')], missing: [] }).has('Pizza')).toBe(false)
  })

  it('matches the reading’s names whatever their case, and keys by the listing’s', () => {
    expect([...readerMarks({ dishes: ['Bagels', 'Kugel'] }, { dishes: [dish('bagels')], missing: ['KUGEL'] })]).toEqual([
      ['Bagels', 'on_menu'],
      ['Kugel', 'not_found'],
    ])
  })

  it('with no reading, nothing was looked for', () => {
    expect([...readerMarks({ dishes: ['Bagels'] }, null)]).toEqual([['Bagels', 'not_looked']])
  })
})

// The user, Oct 28: "Goldie already has hummus platter and it suggested
// hummus as another item. Dotties has all types of donuts flavors and it
// suggests to add donuts … Hipcity has Philly Cheese steak and it suggests
// to add Philly Cheesesteak." Their readings, as production has them.
describe('a dish the listing has by another name', () => {
  it('isn’t new: Goldie’s, Dottie’s and HipCity’s readings change nothing', () => {
    const goldie = dishProposal(
      { dishes: ['Falafel', 'Chopped Salad', 'Hummus Platter'], menuDated: ['Falafel', 'Chopped Salad', 'Hummus Platter'] },
      {
        dishes: [
          { name: 'Falafel', quote: 'Falafel $12', checked: true },
          { name: 'Chopped Salad', quote: 'Chopped Salad', checked: true },
          { name: 'Hummus Platter', quote: 'Hummus Platter', checked: true },
          { name: 'Hummus', quote: 'Quart of Hummus', checked: true },
        ],
        missing: [],
      },
    )
    expect(goldie.updates).toBe(0)
    expect(goldie.rows.map((r) => r.name)).toEqual(['Falafel', 'Chopped Salad', 'Hummus Platter'])

    const flavours = ['Chocolate Donuts', 'Vanilla Donuts', 'Vanilla Sprinkles Donuts', 'Cinnamon Sugar Donuts', 'Boston Cream Donuts', 'Apple Fritters', 'Cinnamon Buns', 'Brownies']
    const dotties = dishProposal({ dishes: flavours }, { dishes: [{ name: 'Donuts', quote: '1000+ donuts a day', checked: true, named: true }], missing: [] })
    expect(dotties.updates).toBe(0)

    const listed = ['Burgers', 'Philly Cheese Steak', 'Sandwiches', 'Chick’n', 'Nuggets', 'Snack Wraps', 'Salads']
    const hip = dishProposal(
      { dishes: listed, menuDated: listed },
      {
        dishes: [
          { name: 'Burgers', quote: 'Burgers & Sandwiches', checked: true },
          { name: 'Philly Cheesesteak', quote: 'Philly Cheesesteak', checked: true },
          { name: 'Philly Cheese Steak', quote: 'Philly Cheesesteak', checked: true },
          { name: 'Sandwiches', quote: 'Burgers & Sandwiches', checked: true },
        ],
        missing: ['Philly Cheese Steak'],
      },
    )
    expect(hip.updates).toBe(0)
    // Its own name for it, once, and not as one off the menu.
    expect(hip.rows.filter((r) => /philly/i.test(r.name))).toEqual([{ name: 'Philly Cheese Steak', status: 'same', quote: 'Philly Cheesesteak', checked: true }])
  })

  it('a dish of its own still is new', () => {
    expect(sameDish('Philly Cheesesteaks', 'philly cheese steak')).toBe(true)
    expect(sameDish('Knishes', 'Knish')).toBe(true)
    expect(listedAlready('Cheesesteak', ['Philly Cheese Steak'])).toBe(true)
    expect(listedAlready('Hummus', ['Hummus Platter'])).toBe(true)
    // Words, not letters: tea isn't in steak.
    expect(listedAlready('Tea', ['Steak'])).toBe(false)
    // More than the listing's isn't the listing's.
    expect(listedAlready('Pizza Bagels', ['Pizza'])).toBe(false)
    expect(listedAlready('Chicken Soup', ['Chicken'])).toBe(false)
    expect(dishProposal({ dishes: ['Pizza'] }, { dishes: [{ name: 'Pizza Bagels', quote: 'Pizza Bagels', checked: true }] }).updates).toBe(1)
  })

  // The user, Oct 28: "drop a dish whose quote doesn't name it, instead of
  // offering it flagged". Dottie's reading, as production has it.
  it('one whose words don’t name it isn’t offered; a listed one stays, marked', () => {
    const p = dishProposal(
      { dishes: ['Brownies'] },
      {
        dishes: [
          { name: 'Donuts', quote: 'chocolate, vanilla, vanilla sprinkles', checked: true, named: false },
          { name: 'Brownies', quote: 'treats', checked: true, named: false },
        ],
      },
    )
    expect(p.updates).toBe(0)
    expect(p.rows).toEqual([{ name: 'Brownies', status: 'same', quote: 'treats', checked: true, named: false }])
  })
})
