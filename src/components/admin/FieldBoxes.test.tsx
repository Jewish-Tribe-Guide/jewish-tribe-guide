// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { CategoryField } from '@/lib/categories'
import { fieldBoxes, type FieldPage } from '@/lib/fieldBoxes'
import type { ListingParts } from '@/lib/listingParts'
import FieldBoxes from './FieldBoxes'

afterEach(cleanup)

// Item 67 (Nov 9's partners): a certificate's link comes with Kosher
// Certification, switched on that field's screen. The Add list showed it
// so; the page's own field list still had it as a row of its own.

const fields: CategoryField[] = [
  { key: 'hours', type: 'hours', label: 'Hours', renderAs: 'row' },
  { key: 'kosherCert', type: 'select', label: 'Kosher Certification', renderAs: 'row', options: [{ label: 'OU', value: 'OU' }] },
  { key: 'kosherCertUrl', type: 'url', label: 'Kosher Certification URL', renderAs: 'row' },
  { key: 'menu', type: 'url', label: 'Menu', renderAs: 'row' },
]
const page: FieldPage = { fields, hasAddress: false, hasPhone: false }
const parts: ListingParts = { main: { title: 'Details', fields: ['hours', 'kosherCert', 'kosherCertUrl', 'menu'] } }

function show(onChange = vi.fn()) {
  render(
    <FieldBoxes
      page={page}
      boxes={fieldBoxes(page, parts)}
      parts={parts}
      freshId={null}
      onChange={onChange}
      onRename={() => {}}
      onRemoveBox={() => {}}
      onAddField={() => {}}
      onShowField={() => {}}
      onRemoveRow={() => {}}
    />,
  )
  return onChange
}

describe('FieldBoxes', () => {
  it('lists a partner with its field, not as a row of its own', () => {
    show()
    expect(screen.getByRole('button', { name: /^Kosher Certification$/ })).toBeTruthy()
    expect(screen.queryByText('Kosher Certification URL')).toBeNull()
  })

  it('keeps the partner right after its field when the field moves', () => {
    const onChange = show()
    const handle = screen.getByRole('button', { name: 'Move Kosher Certification' })
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    fireEvent.keyDown(handle, { key: 'Enter' })
    const moved = onChange.mock.calls.at(-1)
    const main = (moved?.[0] as ListingParts | undefined)?.main?.fields
    const order = moved?.[1] as string[] | null | undefined
    const said = main && main.join() !== parts.main!.fields.join() ? main : order
    expect(said).toEqual(expect.arrayContaining(['kosherCert', 'kosherCertUrl']))
    expect(said!.indexOf('kosherCertUrl')).toBe(said!.indexOf('kosherCert') + 1)
    expect(said!.indexOf('kosherCert')).toBeLessThan(said!.indexOf('hours'))
  })
})
