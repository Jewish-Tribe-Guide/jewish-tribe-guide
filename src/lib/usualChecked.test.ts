import { describe, expect, it } from 'vitest'
import type { Minyan } from './davening'
import { usualCheckedAt } from './usualChecked'
import type { DirectoryResource } from '@/types'

const item = { id: 's', name: 'Shul', confirmedAt: '2026-10-01T12:00:00Z', sectionConfirmed: { weekday: '2026-10-12T12:00:00Z', shabbos: '2026-09-20T12:00:00Z' } } as unknown as DirectoryResource
const row = (tefillah: Minyan['tefillah'], days: Minyan['days']): Minyan => ({ id: 'm', tefillah, days, time: '7:00pm' })

describe('when a minyan’s usual time was last checked', () => {
  it('its own box’s date: Shabbos’s for Friday night and Saturday, else the weekday box’s', () => {
    expect(usualCheckedAt(item, row('mincha', ['mon', 'tue']))).toBe('2026-10-12T12:00:00Z')
    expect(usualCheckedAt(item, row('kabbalas_shabbos', ['fri']))).toBe('2026-10-01T12:00:00Z')
    expect(usualCheckedAt(item, row('shacharis', ['sat']))).toBe('2026-10-01T12:00:00Z')
    // Friday's Shacharis is a weekday one.
    expect(usualCheckedAt(item, row('shacharis', ['fri']))).toBe('2026-10-12T12:00:00Z')
  })

  it('without its row, the weekday box’s', () => {
    expect(usualCheckedAt(item, undefined)).toBe('2026-10-12T12:00:00Z')
  })
})
