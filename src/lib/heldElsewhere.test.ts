import { describe, expect, it, vi } from 'vitest'
import type { Minyan } from './davening'
import { hasMinyan, leaveOutHeldElsewhere, placeNamed } from './heldElsewhere'
import type { ReadRegularTime } from './scheduleUpdate'
import type { SpecialSchedule } from './schedules'

// Mekor's newsletter, Oct 23: "2:00pm Mincha at 1818 Market or Mikveh
// Israel*", every weekday. Mikveh Israel's own Mincha, from its website,
// filed every week as Mekor's and taken off by hand (the user).
const MEKOR = { id: 'mekor', name: 'Mekor Habracha', minyanim: [] as Minyan[] }
const MIKVEH_ISRAEL = {
  id: 'mi',
  name: 'Kahal Kadosh Mikveh Israel',
  minyanim: [
    { id: 'm1', tefillah: 'shacharis', days: ['mon', 'thu'], time: '7:15am' },
    { id: 'm2', tefillah: 'mincha', days: ['mon', 'tue', 'wed', 'thu'], time: '2:00pm' },
  ] as Minyan[],
}
const SOCIETY_HILL = { id: 'shs', name: 'Society Hill Synagogue', minyanim: [{ id: 's1', tefillah: 'maariv', days: ['mon'], time: '7:00pm' }] as Minyan[] }
const GUIDE = [MEKOR, MIKVEH_ISRAEL, SOCIETY_HILL]

let n = 0
const t = (x: Partial<ReadRegularTime> & Pick<ReadRegularTime, 'tefillah' | 'time'>): ReadRegularTime => ({ id: `t${++n}`, days: [], quote: x.time, checked: true, ...x })
const MON = '2026-10-26'

describe('which place a message names', () => {
  it('knows a shul by the name a message calls it', () => {
    expect(placeNamed('1818 Market or Mikveh Israel', 'mekor', GUIDE)?.id).toBe('mi')
    expect(placeNamed('Society Hill', 'mekor', GUIDE)?.id).toBe('shs')
    expect(placeNamed('the JCC', 'mekor', GUIDE)).toBeNull()
  })

  it('never names the shul itself', () => {
    expect(placeNamed('Mekor Habracha', 'mekor', GUIDE)).toBeNull()
  })

  it('takes a whole name, not part of a word', () => {
    expect(placeNamed('Mikveh Israelite Hall', 'mekor', GUIDE)).toBeNull()
  })
})

describe('whether that place already has the minyan', () => {
  it('the same tefillah that day, at about that time', () => {
    expect(hasMinyan(MIKVEH_ISRAEL, 'minyanim', t({ tefillah: 'mincha', time: '2:00pm', date: MON }))).toBe(true)
    expect(hasMinyan(MIKVEH_ISRAEL, 'minyanim', t({ tefillah: 'mincha', time: '2:10pm', date: MON }))).toBe(true)
    expect(hasMinyan(MIKVEH_ISRAEL, 'minyanim', t({ tefillah: 'mincha', time: '6:00pm', date: MON }))).toBe(false)
    // Friday: Mikveh Israel has no Mincha.
    expect(hasMinyan(MIKVEH_ISRAEL, 'minyanim', t({ tefillah: 'mincha', time: '2:00pm', date: '2026-10-30' }))).toBe(false)
    expect(hasMinyan(MIKVEH_ISRAEL, 'minyanim', t({ tefillah: 'mincha', time: '2:00pm', days: ['tue'] }))).toBe(true)
  })

  it('counts a week’s times it has on that date', () => {
    const week: SpecialSchedule = { id: 'w', name: 'Times for Oct 25 – Oct 31', from: '2026-10-25', to: '2026-10-31', mode: 'replace', kind: 'week', minyanim: [{ id: 'x', tefillah: 'mincha', on: ['2026-10-30'], time: '1:30pm' }] }
    expect(hasMinyan({ ...MIKVEH_ISRAEL, minyanim_schedules: [week] } as typeof MIKVEH_ISRAEL, 'minyanim', t({ tefillah: 'mincha', time: '1:30pm', date: '2026-10-30' }))).toBe(true)
  })

  it('a Mincha & Maariv is the same minyan as a Maariv', () => {
    expect(hasMinyan(SOCIETY_HILL, 'minyanim', t({ tefillah: 'mincha_maariv', time: '7:00pm', date: MON }))).toBe(true)
  })
})

describe('leaving out a minyan another shul in the guide has', () => {
  it('Mekor’s Mincha at Mikveh Israel is left out, once, with a line saying so', async () => {
    const times = [
      t({ tefillah: 'shacharis', time: '6:45am', date: MON }),
      t({ tefillah: 'mincha', time: '2:00pm', date: MON, where: '1818 Market or Mikveh Israel' }),
      t({ tefillah: 'mincha', time: '2:00pm', date: '2026-10-27', where: '1818 Market or Mikveh Israel' }),
    ]
    const got = await leaveOutHeldElsewhere(times, { shulId: 'mekor', key: 'minyanim', others: async () => GUIDE })
    expect(got.times.map((x) => x.tefillah)).toEqual(['shacharis'])
    expect(got.left).toEqual(['Left out: Mincha 2:00pm, already on Kahal Kadosh Mikveh Israel'])
  })

  // The user: "a shul definitely could have mincha at a second location".
  it('keeps the shul’s own minyan somewhere else, saying where', async () => {
    const times = [
      t({ tefillah: 'mincha', time: '1:15pm', days: ['mon', 'tue'], where: '1818 Market', notes: 'in the lobby' }),
      // Named, but Mikveh Israel has no Mincha then: still this shul's.
      t({ tefillah: 'mincha', time: '6:00pm', date: MON, where: 'Mikveh Israel' }),
    ]
    const got = await leaveOutHeldElsewhere(times, { shulId: 'mekor', key: 'minyanim', others: async () => GUIDE })
    expect(got.left).toEqual([])
    expect(got.times.map((x) => x.notes)).toEqual(['in the lobby, at 1818 Market', 'at Mikveh Israel'])
  })

  it('without the guide’s listings, leaves nothing out', async () => {
    const got = await leaveOutHeldElsewhere([t({ tefillah: 'mincha', time: '2:00pm', date: MON, where: 'Mikveh Israel' })], { shulId: 'mekor', key: 'minyanim' })
    expect(got.times).toHaveLength(1)
    expect(got.left).toEqual([])
  })

  it('asks for the listings only when a time was read as held elsewhere', async () => {
    const others = vi.fn(async () => GUIDE)
    await leaveOutHeldElsewhere([t({ tefillah: 'mincha', time: '2:00pm', date: MON })], { shulId: 'mekor', key: 'minyanim', others })
    expect(others).not.toHaveBeenCalled()
  })
})
