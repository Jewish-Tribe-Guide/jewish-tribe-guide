import { describe, expect, it } from 'vitest'
import {
  clampTimeText,
  formatAnchorRule,
  formatDays,
  groupByDay,
  groupByTefillah,
  isMinyanim,
  mergeSameDayTimes,
  parseTimeToMinutes,
  type Minyan,
  type ShulInfo,
} from './davening'

const minyan = (over: Partial<Minyan> & Pick<Minyan, 'tefillah' | 'days' | 'time'>): Minyan => ({
  id: `${over.tefillah}-${over.time}`,
  ...over,
})

describe('parseTimeToMinutes', () => {
  it('parses 24-hour times', () => {
    expect(parseTimeToMinutes('19:30')).toBe(19 * 60 + 30)
    expect(parseTimeToMinutes('00:00')).toBe(0)
  })

  it('parses am/pm times with or without a space', () => {
    expect(parseTimeToMinutes('7:30am')).toBe(7 * 60 + 30)
    expect(parseTimeToMinutes('7:30 AM')).toBe(7 * 60 + 30)
    expect(parseTimeToMinutes('7:30 pm')).toBe(19 * 60 + 30)
  })

  it('handles the 12 am/pm boundary', () => {
    expect(parseTimeToMinutes('12:00am')).toBe(0)
    expect(parseTimeToMinutes('12:30am')).toBe(30)
    expect(parseTimeToMinutes('12:00pm')).toBe(12 * 60)
    expect(parseTimeToMinutes('12:30pm')).toBe(12 * 60 + 30)
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseTimeToMinutes('  8:15 AM  ')).toBe(8 * 60 + 15)
  })

  it('sorts relative times last by returning Infinity', () => {
    expect(parseTimeToMinutes('20 min before sunset')).toBe(Infinity)
    expect(parseTimeToMinutes('At Havdalah')).toBe(Infinity)
    expect(parseTimeToMinutes('')).toBe(Infinity)
  })

  // Documents a real gap: a shul that enters "7am" rather than "7:00am" sorts
  // to the end of its group instead of first. The intake form produces the
  // padded form, so this only bites hand-edited/imported data.
  it('does not parse an hour without minutes', () => {
    expect(parseTimeToMinutes('7am')).toBe(Infinity)
  })
})

describe('formatAnchorRule', () => {
  it('renders a zero offset as "At <zman>"', () => {
    expect(formatAnchorRule('sunset', 0)).toBe('At Sunset')
  })

  it('renders negative offsets as "before" and positive as "after"', () => {
    expect(formatAnchorRule('sunset', -20)).toBe('20 min before Sunset')
    expect(formatAnchorRule('havdalah', 10)).toBe('10 min after Havdalah')
    expect(formatAnchorRule('candle_lighting', -15)).toBe('15 min before Candle Lighting')
  })
})

describe('isMinyanim', () => {
  it('accepts a well-formed array', () => {
    expect(isMinyanim([{ id: 'a', tefillah: 'mincha', days: ['mon'], time: '1:30pm' }])).toBe(true)
    expect(isMinyanim([])).toBe(true)
  })

  it('rejects non-arrays and entries missing required keys', () => {
    expect(isMinyanim(null)).toBe(false)
    expect(isMinyanim({ tefillah: 'mincha' })).toBe(false)
    expect(isMinyanim([{ tefillah: 'mincha', days: ['mon'] }])).toBe(false)
    expect(isMinyanim([null])).toBe(false)
  })
})

describe('formatDays', () => {
  it('calls all seven weekdays "Daily"', () => {
    expect(formatDays(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])).toBe('Daily')
  })

  it('collapses three or more consecutive days into a range', () => {
    expect(formatDays(['mon', 'tue', 'wed', 'thu', 'fri'])).toBe('Mon–Fri')
    expect(formatDays(['sun', 'mon', 'tue'])).toBe('Sun–Tue')
  })

  it('lists two consecutive days rather than ranging them', () => {
    expect(formatDays(['mon', 'tue'])).toBe('Mon, Tue')
  })

  it('lists non-consecutive days individually', () => {
    expect(formatDays(['mon', 'wed', 'fri'])).toBe('Mon, Wed, Fri')
  })

  it('sorts days into week order regardless of input order', () => {
    expect(formatDays(['fri', 'mon', 'wed'])).toBe('Mon, Wed, Fri')
  })

  it('appends the pseudo-days by full name instead of folding them into a range', () => {
    expect(formatDays(['mon', 'wed', 'rosh_chodesh'])).toBe('Mon, Wed, Rosh Chodesh')
    expect(formatDays(['rosh_chodesh'])).toBe('Rosh Chodesh')
    expect(formatDays(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'holiday'])).toBe(
      'Daily, Holiday',
    )
  })

  it('returns an empty string for no days', () => {
    expect(formatDays([])).toBe('')
  })
})

describe('groupByTefillah', () => {
  const shuls: ShulInfo[] = [
    {
      name: 'Beth Israel',
      denomination: 'Orthodox',
      minyanim: [
        minyan({ tefillah: 'mincha', days: ['mon'], time: '1:30pm' }),
        minyan({ tefillah: 'shacharis', days: ['sun'], time: '8:00am' }),
      ],
    },
    {
      name: 'Ohev Shalom',
      minyanim: [minyan({ tefillah: 'shacharis', days: ['sun'], time: '7:00am' })],
    },
  ]

  it('returns groups in canonical tefillah order, omitting empty ones', () => {
    expect(groupByTefillah(shuls).map((g) => g.tefillah)).toEqual(['shacharis', 'mincha'])
  })

  it('sorts rows by first day, then time', () => {
    const shacharis = groupByTefillah(shuls).find((g) => g.tefillah === 'shacharis')
    expect(shacharis?.rows.map((r) => r.time)).toEqual(['7:00am', '8:00am'])
  })

  it('carries the shul name, denomination and day label onto each row', () => {
    const mincha = groupByTefillah(shuls).find((g) => g.tefillah === 'mincha')
    expect(mincha?.rows[0]).toMatchObject({
      shul: 'Beth Israel',
      denomination: 'Orthodox',
      daysLabel: 'Mon',
    })
  })

  it('returns nothing for no shuls', () => {
    expect(groupByTefillah([])).toEqual([])
  })
})

describe('mergeSameDayTimes', () => {
  it('joins adjacent rows with the same days and notes', () => {
    const rows = groupByTefillah([
      {
        name: 'Beth Israel',
        minyanim: [
          minyan({ tefillah: 'shacharis', days: ['sun'], time: '7:30am' }),
          minyan({ tefillah: 'shacharis', days: ['sun'], time: '8:30am' }),
        ],
      },
    ])[0].rows
    const merged = mergeSameDayTimes(rows)
    expect(merged).toHaveLength(1)
    expect(merged[0].time).toBe('7:30am, 8:30am')
  })

  it('keeps rows apart when their notes differ', () => {
    const rows = groupByTefillah([
      {
        name: 'Beth Israel',
        minyanim: [
          minyan({ tefillah: 'shacharis', days: ['sun'], time: '7:30am', notes: 'main' }),
          minyan({ tefillah: 'shacharis', days: ['sun'], time: '8:30am', notes: 'social hall' }),
        ],
      },
    ])[0].rows
    expect(mergeSameDayTimes(rows)).toHaveLength(2)
  })

  it('drops the anchor when merging, since it no longer maps to the joined string', () => {
    const rows = groupByTefillah([
      {
        name: 'Beth Israel',
        minyanim: [
          minyan({ tefillah: 'mincha', days: ['fri'], time: 'At Sunset', anchor: 'sunset', offsetMinutes: 0 }),
          minyan({
            tefillah: 'mincha',
            days: ['fri'],
            time: '20 min before Sunset',
            anchor: 'sunset',
            offsetMinutes: -20,
          }),
        ],
      },
    ])[0].rows
    const merged = mergeSameDayTimes(rows)
    expect(merged).toHaveLength(1)
    expect(merged[0].anchor).toBeUndefined()
    expect(merged[0].offsetMinutes).toBeUndefined()
  })

  // Same reasoning as the anchor: bounds clamp ONE computed time, so carrying
  // them onto a joined "6:00pm, 6:30pm" string would have a caller clamp a
  // string that is no longer a single time.
  it('drops the bounds when merging', () => {
    const rows = groupByTefillah([
      {
        name: 'Beth Israel',
        minyanim: [
          minyan({
            tefillah: 'kabbalas_shabbos',
            days: ['fri'],
            time: 'At Candle Lighting (between 5:00 PM and 7:00 PM)',
            anchor: 'candle_lighting',
            offsetMinutes: 0,
            notBefore: '17:00',
            notAfter: '19:00',
          }),
          minyan({
            tefillah: 'kabbalas_shabbos',
            days: ['fri'],
            time: 'At Sunset',
            anchor: 'sunset',
            offsetMinutes: 0,
          }),
        ],
      },
    ])[0].rows
    const merged = mergeSameDayTimes(rows)
    expect(merged).toHaveLength(1)
    expect(merged[0].notBefore).toBeUndefined()
    expect(merged[0].notAfter).toBeUndefined()
  })

  it('preserves the bounds on an unmerged row', () => {
    const rows = groupByTefillah([
      {
        name: 'Beth Israel',
        minyanim: [
          minyan({
            tefillah: 'kabbalas_shabbos',
            days: ['fri'],
            time: 'At Candle Lighting (between 5:00 PM and 7:00 PM)',
            anchor: 'candle_lighting',
            offsetMinutes: 0,
            notBefore: '17:00',
            notAfter: '19:00',
          }),
        ],
      },
    ])[0].rows
    expect(mergeSameDayTimes(rows)[0].notBefore).toBe('17:00')
    expect(mergeSameDayTimes(rows)[0].notAfter).toBe('19:00')
  })

  it('preserves the anchor on an unmerged row', () => {
    const rows = groupByTefillah([
      {
        name: 'Beth Israel',
        minyanim: [
          minyan({ tefillah: 'mincha', days: ['fri'], time: 'At Sunset', anchor: 'sunset', offsetMinutes: 0 }),
        ],
      },
    ])[0].rows
    expect(mergeSameDayTimes(rows)[0].anchor).toBe('sunset')
  })
})

describe('groupByDay', () => {
  const shuls: ShulInfo[] = [
    {
      name: 'Beth Israel',
      minyanim: [
        minyan({ tefillah: 'maariv', days: ['mon', 'tue'], time: '8:00pm' }),
        minyan({ tefillah: 'shacharis', days: ['mon'], time: '7:00am' }),
      ],
    },
  ]

  it('fans a multi-day minyan out into one row per day', () => {
    const groups = groupByDay(shuls)
    expect(groups.map((g) => g.day)).toEqual(['mon', 'tue'])
    expect(groups.find((g) => g.day === 'mon')?.rows).toHaveLength(2)
    expect(groups.find((g) => g.day === 'tue')?.rows).toHaveLength(1)
  })

  it('sorts each day’s rows by tefillah order, then time', () => {
    const monday = groupByDay(shuls).find((g) => g.day === 'mon')
    expect(monday?.rows.map((r) => r.tefillah)).toEqual(['shacharis', 'maariv'])
  })

  it('orders the pseudo-days after the real weekdays', () => {
    const groups = groupByDay([
      {
        name: 'Beth Israel',
        minyanim: [minyan({ tefillah: 'shacharis', days: ['rosh_chodesh', 'mon'], time: '6:45am' })],
      },
    ])
    expect(groups.map((g) => g.day)).toEqual(['mon', 'rosh_chodesh'])
    expect(groups[1].label).toBe('Rosh Chodesh')
  })

  it('returns nothing when no minyan lists any day', () => {
    expect(groupByDay([{ name: 'Beth Israel', minyanim: [minyan({ tefillah: 'mincha', days: [], time: '1:00pm' })] }])).toEqual([])
  })
})

// ── Bounded (clamped) zman rules ───────────────────────────────────────────────
//
// The case these exist for: a shtiebel that davens Kabbalas Shabbos at candle
// lighting, but never before 5:00pm and never after 7:00pm. Seasons can't
// express it — the rule is one rule all year, and the clamp only bites at the
// two ends of the year — so it lives on the time rule itself.

describe('formatAnchorRule with bounds', () => {
  it('appends nothing when neither bound is set', () => {
    expect(formatAnchorRule('candle_lighting', 0, {})).toBe('At Candle Lighting')
  })

  it('names a lower bound on its own', () => {
    expect(formatAnchorRule('candle_lighting', 0, { notBefore: '17:00' })).toBe(
      'At Candle Lighting (not before 5:00 PM)',
    )
  })

  it('names an upper bound on its own', () => {
    expect(formatAnchorRule('candle_lighting', 0, { notAfter: '19:00' })).toBe(
      'At Candle Lighting (not after 7:00 PM)',
    )
  })

  it('reads as a window when both are set', () => {
    expect(
      formatAnchorRule('candle_lighting', 0, { notBefore: '17:00', notAfter: '19:00' }),
    ).toBe('At Candle Lighting (between 5:00 PM and 7:00 PM)')
  })

  it('keeps the offset phrasing in front of the window', () => {
    expect(formatAnchorRule('sunset', -20, { notAfter: '19:00' })).toBe(
      '20 min before Sunset (not after 7:00 PM)',
    )
  })
})

describe('clampTimeText', () => {
  const bounds = { notBefore: '17:00', notAfter: '19:00' }

  it('leaves a time inside the window alone', () => {
    expect(clampTimeText('6:12 PM', bounds)).toBe('6:12 PM')
  })

  it('raises a time below the lower bound', () => {
    expect(clampTimeText('4:18 PM', bounds)).toBe('5:00 PM')
  })

  it('lowers a time above the upper bound', () => {
    expect(clampTimeText('8:04 PM', bounds)).toBe('7:00 PM')
  })

  it('treats each bound as inclusive', () => {
    expect(clampTimeText('5:00 PM', bounds)).toBe('5:00 PM')
    expect(clampTimeText('7:00 PM', bounds)).toBe('7:00 PM')
  })

  it('applies a lone bound without needing the other', () => {
    expect(clampTimeText('4:18 PM', { notBefore: '17:00' })).toBe('5:00 PM')
    expect(clampTimeText('4:18 PM', { notAfter: '19:00' })).toBe('4:18 PM')
  })

  it('is a no-op with no bounds set', () => {
    expect(clampTimeText('4:18 PM', {})).toBe('4:18 PM')
  })

  // Never invent a time: an unparseable input is passed straight through
  // rather than being replaced by a bound that may be nothing like it.
  it('passes through a time it cannot parse', () => {
    expect(clampTimeText('At Havdalah', bounds)).toBe('At Havdalah')
  })
})
