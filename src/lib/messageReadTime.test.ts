import { describe, expect, it } from 'vitest'
import { messageReadTimeRow } from './messageReadTime'

describe('messageReadTimeRow', () => {
  it('keeps the time and what the model was asked, as whole numbers', () => {
    expect(
      messageReadTimeRow({
        community: 'philly',
        ms: 8421.6,
        modelMs: 7900.2,
        model: 'gpt-6-luna',
        effort: null,
        photos: 1,
        proposals: 2,
        followUps: 1,
        usage: { input: 12000, cachedInput: 11000, output: 900 },
      }),
    ).toEqual({
      community_id: 'philly',
      ms: 8422,
      model_ms: 7900,
      model: 'gpt-6-luna',
      effort: null,
      photos: 1,
      proposals: 2,
      follow_ups: 1,
      input_tokens: 12000,
      cached_tokens: 11000,
      output_tokens: 900,
    })
  })

  it('never holds the post itself', () => {
    const row = messageReadTimeRow({ community: 'philly', ms: 1, modelMs: null, model: null, effort: null, photos: 0, proposals: 0, followUps: 0, usage: null })
    expect(Object.keys(row).sort()).toEqual(
      ['cached_tokens', 'community_id', 'effort', 'follow_ups', 'input_tokens', 'ms', 'model', 'model_ms', 'output_tokens', 'photos', 'proposals'].sort(),
    )
  })
})
