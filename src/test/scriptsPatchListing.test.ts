import { describe, expect, it, vi } from 'vitest'
import { patchListing } from '../../scripts/patchListing.mjs'

// The scripts' copy of patchListing (Nov 21, after migration 112): only what
// changed goes to patch_resource_details, with the row's community.

describe('scripts/patchListing.mjs', () => {
  const row = { id: 'r1', community_id: 'philly', name: 'A', details: { hours: '9-5', googleSyncedAt: 'a', lastSyncError: 'x' } }

  it('sends only the changed keys, the gone ones and the columns', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    await patchListing({ rpc }, row, { hours: '9-5', googleSyncedAt: 'b' }, { name: 'B' })
    expect(rpc).toHaveBeenCalledWith('patch_resource_details', {
      p_community: 'philly',
      p_id: 'r1',
      p_set: { googleSyncedAt: 'b' },
      p_unset: ['lastSyncError'],
      p_columns: { name: 'B' },
      p_if: null,
    })
  })

  it('writes nothing when nothing changed, and throws a failed write', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'timeout' } })
    await patchListing({ rpc }, row, { ...row.details })
    expect(rpc).not.toHaveBeenCalled()
    await expect(patchListing({ rpc }, row, { a: 1 })).rejects.toThrow('A: timeout')
  })
})
