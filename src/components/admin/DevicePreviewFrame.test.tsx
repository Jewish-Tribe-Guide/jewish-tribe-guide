// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { IframeViewport } from './DevicePreviewFrame'

afterEach(cleanup)

describe('IframeViewport', () => {
  // The user, Nov 9: in the phone preview a page with one place drew its
  // card as a tall white block running under the footer. about:blank has
  // no doctype, so the frame was in quirks mode, where a card's h-full
  // reaches up to the page's height instead of its row's.
  it('lays the preview out in standards mode, not quirks mode', async () => {
    render(
      <IframeViewport width={390} height={844}>
        <p>Inside</p>
      </IframeViewport>,
    )
    const frame = screen.getByTitle('Device preview') as HTMLIFrameElement
    await waitFor(() => expect(frame.contentDocument?.body.textContent).toContain('Inside'))
    expect(frame.contentDocument?.compatMode).toBe('CSS1Compat')
  })
})
