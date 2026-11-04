import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase/admin', () => ({ getAdminClient: vi.fn() }))
vi.mock('./categoryStore', () => ({ listCategoriesUncached: vi.fn() }))
vi.mock('./eruvStore', () => ({ listEruvimForAdmin: vi.fn() }))
vi.mock('./eruvFind', () => ({ findEruvStatusPages: vi.fn() }))
vi.mock('./menuReadingStore', () => ({ listMenuReadings: vi.fn() }))
vi.mock('./menuPlaceRead', () => ({ readMenuAgain: vi.fn() }))
vi.mock('./googleJobRun', () => ({ findOnGoogle: vi.fn(), loadGoogleJob: vi.fn() }))
vi.mock('./watchStore', () => ({ listWatches: vi.fn() }))
vi.mock('./lookAgainStore', () => ({ listLookRows: vi.fn(), getNotThese: vi.fn(async () => []), saveTry: vi.fn(async () => {}) }))

import { listEruvimForAdmin } from './eruvStore'
import { findEruvStatusPages } from './eruvFind'
import { saveTry } from './lookAgainStore'
import { tryLook } from './lookAgainRun'

afterEach(() => vi.clearAllMocks())

const ELKINS = { kind: 'eruv' as const, id: 'elkins-park', name: 'Elkins Park Eruv' }

describe('tryLook, an eruv', () => {
  // The user, Nov 4: Look again said it all worked for Elkins Park, whose
  // website has said "page not found" since Oct 25.
  it('a website that didn’t open is a failed try, not "nothing found"', async () => {
    vi.mocked(listEruvimForAdmin).mockResolvedValue({ eruvim: [{ id: 'elkins-park', website: 'https://www.yiep.org/eruv-map' }] } as never)
    vi.mocked(findEruvStatusPages).mockResolvedValue({ error: 'The page answered 404' })
    await expect(tryLook('philly', ELKINS, undefined)).rejects.toThrow('Its website didn’t open: The page answered 404')
    expect(saveTry).not.toHaveBeenCalled()
  })

  it('a website that opened with nothing on it is a try that found nothing', async () => {
    vi.mocked(listEruvimForAdmin).mockResolvedValue({ eruvim: [{ id: 'elkins-park', website: 'https://www.yiep.org/' }] } as never)
    vi.mocked(findEruvStatusPages).mockResolvedValue({ found: [] })
    await expect(tryLook('philly', ELKINS, undefined)).resolves.toEqual({ found: false })
    expect(saveTry).toHaveBeenCalledWith('philly', 'eruv', 'elkins-park', expect.any(String), null)
  })
})
