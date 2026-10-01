import { describe, expect, it } from 'vitest'
import { festivalsFrom } from './festivals'

// Hebcal's own items (Oct 1 2026 onward, and Sukkos' start).
const h = (date: string, title: string, hdate: string) => ({ category: 'holiday', title, date, hdate })
const items = [
  h('2026-09-25', 'Erev Sukkot', '14 Tishrei 5787'),
  h('2026-09-26', 'Sukkot I', '15 Tishrei 5787'),
  h('2026-09-27', 'Sukkot II', '16 Tishrei 5787'),
  h('2026-09-28', 'Sukkot III (CH’’M)', '17 Tishrei 5787'),
  h('2026-10-02', 'Sukkot VII (Hoshana Raba)', '21 Tishrei 5787'),
  h('2026-10-03', 'Shmini Atzeret', '22 Tishrei 5787'),
  h('2026-10-04', 'Simchat Torah', '23 Tishrei 5787'),
  h('2026-12-04', 'Chanukah: 1 Candle', '24 Kislev 5787'),
  h('2027-04-22', 'Pesach I', '15 Nisan 5787'),
  h('2027-04-29', 'Pesach VIII', '22 Nisan 5787'),
  { category: 'candles', title: 'Candle lighting', date: '2026-10-02T18:23:00-04:00' },
]

describe('the year’s festivals', () => {
  it('Sukkos from its first day to Simchas Torah, not Erev; Chanukah isn’t one', () => {
    const f = festivalsFrom(items)
    expect(f.map((x) => [x.name, x.from, x.to])).toEqual([
      ['Sukkos 5787', '2026-09-26', '2026-10-04'],
      ['Pesach 5787', '2027-04-22', '2027-04-29'],
    ])
    expect(f[0].days.map((d) => d.name)).toEqual(['Sukkos', 'Sukkos', 'Chol HaMoed', 'Hoshana Rabbah', 'Shemini Atzeres', 'Simchas Torah'])
  })
})
