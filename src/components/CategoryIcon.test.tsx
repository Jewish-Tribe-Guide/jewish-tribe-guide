// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import CategoryIcon from './CategoryIcon'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

const PHOTO = 'https://abcdefg.supabase.co/storage/v1/object/public/site-assets/listing-photo/p.jpeg'
const img = (c: HTMLElement) => c.querySelector('img')!

// A listing's photo is stored at up to 640px and shown as a 40px avatar in
// every row of every list. It used to be downloaded whole each time (the
// Vercel optimizer is off for uploads); it now asks Supabase Storage for a
// small crop instead — 13.5 KB down to 1.5 KB on a real photo.
describe('CategoryIcon with an uploaded photo', () => {
  it('requests a small Storage-made copy at 2x its size, not the original', () => {
    const { container } = render(<CategoryIcon icon="🛒" color="#123456" iconImageUrl={PHOTO} sizePx={40} />)

    const src = new URL(img(container).getAttribute('src')!)
    expect(src.pathname).toContain('/storage/v1/render/image/public/')
    expect(src.searchParams.get('width')).toBe('80')
  })

  it('falls back to the original photo if the thumbnail fails to load', () => {
    const { container } = render(<CategoryIcon icon="🛒" color="#123456" iconImageUrl={PHOTO} sizePx={40} />)
    expect(img(container).getAttribute('src')).toContain('/render/image/')

    // A project without Storage transformations answers 400.
    fireEvent.error(img(container))

    expect(img(container).getAttribute('src')).toContain('/object/public/')
  })

  it('leaves photos on other hosts exactly as before', () => {
    const { container } = render(
      <CategoryIcon icon="🛒" color="#123456" iconImageUrl="https://images.unsplash.com/photo-1?w=400" sizePx={40} />,
    )
    expect(img(container).getAttribute('src')).not.toContain('supabase')
  })

  it('serves the original when thumbnails are switched off', () => {
    vi.stubEnv('NEXT_PUBLIC_STORAGE_THUMBNAILS_DISABLED', '1')
    const { container } = render(<CategoryIcon icon="🛒" color="#123456" iconImageUrl={PHOTO} sizePx={40} />)
    expect(img(container).getAttribute('src')).toContain('/object/public/')
  })

  it('shows no image at all when there is no photo', () => {
    const { container } = render(<CategoryIcon icon="🛒" color="#123456" />)
    expect(container.querySelector('img')).toBeNull()
  })
})
