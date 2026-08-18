// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { Hospital } from '@/types'
import HospitalsDirectory from './HospitalsDirectory'

afterEach(() => cleanup())

function makeHospital(overrides: Partial<Hospital> = {}): Hospital {
  return {
    id: 'jefferson',
    name: 'Jefferson',
    latitude: 39.95,
    longitude: -75.16,
    timezone: 'America/New_York',
    ...overrides,
  }
}

const handlers = { onSelect: vi.fn(), onUp: vi.fn() }
const noAnchor = { coords: null, label: '' }

describe('HospitalsDirectory', () => {
  it('renders a card per hospital, with the "Which hospital?" heading', () => {
    const hospitals = [makeHospital({ id: 'a', name: 'Jefferson' }), makeHospital({ id: 'b', name: 'Einstein' })]
    renderWithProviders(<HospitalsDirectory anchor={noAnchor} {...handlers} />, { content: { hospitals } })

    expect(screen.getByText('Which hospital?')).toBeInTheDocument()
    expect(screen.getByText('Jefferson')).toBeInTheDocument()
    expect(screen.getByText('Einstein')).toBeInTheDocument()
  })

  it('shows a feature badge per truthy HospitalInfo field', () => {
    const hospitals = [
      makeHospital({
        info: {
          jewishMedicalProfessionals: [],
          bikurCholim: { room: '', contact: { name: '', phone: '' } },
          prayerSpace: 'Room 200',
          jewishChaplain: { name: 'Rabbi Cohen', phone: '215-555-0100' },
          shabbatAccommodations: 'Available on request',
        },
      }),
    ]
    renderWithProviders(<HospitalsDirectory anchor={noAnchor} {...handlers} />, { content: { hospitals } })

    expect(screen.getByText('Chaplain')).toBeInTheDocument()
    expect(screen.getByText('Prayer space')).toBeInTheDocument()
    expect(screen.getByText('Kosher & Shabbos')).toBeInTheDocument()
  })

  it('calls onSelect with the hospital id when its card is clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const hospitals = [makeHospital({ id: 'jefferson', name: 'Jefferson' })]
    renderWithProviders(<HospitalsDirectory anchor={noAnchor} {...handlers} onSelect={onSelect} />, {
      content: { hospitals },
    })

    await user.click(screen.getByText('Jefferson'))
    expect(onSelect).toHaveBeenCalledWith('jefferson')
  })

  describe('search', () => {
    it('hides the search box at or below 6 hospitals', () => {
      const hospitals = Array.from({ length: 6 }, (_, i) => makeHospital({ id: `h${i}`, name: `Hospital ${i}` }))
      renderWithProviders(<HospitalsDirectory anchor={noAnchor} {...handlers} />, { content: { hospitals } })
      expect(screen.queryByLabelText('Search hospitals')).not.toBeInTheDocument()
    })

    it('shows the search box past 6 hospitals, and filters by name', async () => {
      const user = userEvent.setup()
      const hospitals = Array.from({ length: 7 }, (_, i) => makeHospital({ id: `h${i}`, name: `Hospital ${i}` }))
      renderWithProviders(<HospitalsDirectory anchor={noAnchor} {...handlers} />, { content: { hospitals } })

      await user.type(screen.getByLabelText('Search hospitals'), '3')

      expect(screen.getByText('Hospital 3')).toBeInTheDocument()
      expect(screen.queryByText('Hospital 0')).not.toBeInTheDocument()
    })

    it('shows a "no matches" message for a search with no hits', async () => {
      const user = userEvent.setup()
      const hospitals = Array.from({ length: 7 }, (_, i) => makeHospital({ id: `h${i}`, name: `Hospital ${i}` }))
      renderWithProviders(<HospitalsDirectory anchor={noAnchor} {...handlers} />, { content: { hospitals } })

      await user.type(screen.getByLabelText('Search hospitals'), 'nonexistent')

      expect(screen.getByText(/No hospitals match/)).toBeInTheDocument()
    })
  })

  describe('distance sorting', () => {
    it('sorts nearest-first and flags the nearest one, once an anchor is set', () => {
      const hospitals = [
        makeHospital({ id: 'far', name: 'Far Hospital', latitude: 41, longitude: -76 }),
        makeHospital({ id: 'near', name: 'Near Hospital', latitude: 39.951, longitude: -75.161 }),
      ]
      const anchor = { coords: { lat: 39.95, lng: -75.16 }, label: 'Home' }
      renderWithProviders(<HospitalsDirectory anchor={anchor} {...handlers} />, { content: { hospitals } })

      const names = screen.getAllByText(/Hospital$/).map((el) => el.textContent)
      expect(names).toEqual(['Near Hospital', 'Far Hospital'])
      expect(screen.getByText('Nearest you')).toBeInTheDocument()
    })

    it('shows no distance or "Nearest you" badge without an anchor', () => {
      const hospitals = [makeHospital({ id: 'a', name: 'Jefferson' })]
      renderWithProviders(<HospitalsDirectory anchor={noAnchor} {...handlers} />, { content: { hospitals } })

      expect(screen.queryByText(/mi$/)).not.toBeInTheDocument()
      expect(screen.queryByText('Nearest you')).not.toBeInTheDocument()
    })
  })

  it('has no Map button when onViewMap is omitted', () => {
    renderWithProviders(<HospitalsDirectory anchor={noAnchor} {...handlers} />, {
      content: { hospitals: [makeHospital()] },
    })
    expect(screen.queryByRole('button', { name: /Map/ })).not.toBeInTheDocument()
  })

  it('calls onViewMap when the Map button is clicked', async () => {
    const user = userEvent.setup()
    const onViewMap = vi.fn()
    renderWithProviders(<HospitalsDirectory anchor={noAnchor} {...handlers} onViewMap={onViewMap} />, {
      content: { hospitals: [makeHospital()] },
    })

    await user.click(screen.getByRole('button', { name: /Map/ }))
    expect(onViewMap).toHaveBeenCalledTimes(1)
  })

  it('calls onUp when the Up button is clicked', async () => {
    const user = userEvent.setup()
    const onUp = vi.fn()
    renderWithProviders(<HospitalsDirectory anchor={noAnchor} {...handlers} onUp={onUp} upLabel="All resources" />, {
      content: { hospitals: [makeHospital()] },
    })

    await user.click(screen.getByRole('button', { name: /All resources/ }))
    expect(onUp).toHaveBeenCalledTimes(1)
  })
})
