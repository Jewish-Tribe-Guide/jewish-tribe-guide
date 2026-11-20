// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import CategoryIcon from './CategoryIcon'
import { TilePhoto } from './home/sections'

// On the live site (Nov 20) the phone home fetched a 2070px Unsplash photo,
// 159 KB, for a 108px tile, and the whole 1024px logo for a 36px one: with
// Vercel's optimizer switched off (NEXT_PUBLIC_IMAGES_UNOPTIMIZED), a photo
// was served as pasted. A photo whose host resizes it now asks that host for
// the size drawn, optimizer or not.

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

const PASTED = 'https://plus.unsplash.com/premium_photo-1683121938935?q=80&w=2070&auto=format&fit=crop'

/** Every URL the browser could fetch for this <img>: its src and each
 *  srcset candidate. */
function candidates(img: HTMLImageElement): URL[] {
  const set = (img.getAttribute('srcset') ?? '').split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean)
  return [img.getAttribute('src')!, ...set].map((u) => new URL(u, 'https://site.test'))
}

/** What a browser fetches for an <img> drawn `drawn` CSS px wide on a 2x
 *  screen: the smallest srcset candidate covering it (the largest, if none
 *  does; the src, with no srcset). */
function fetched(img: HTMLImageElement, drawn: number): URL {
  const set = (img.getAttribute('srcset') ?? '').split(',').map((c) => c.trim().split(/\s+/)).filter((c) => c[0])
  if (!set.length) return new URL(img.getAttribute('src')!, 'https://site.test')
  const byWidth = set.map(([u, d]) => ({ u, w: Number(d.replace('w', '')) })).sort((a, b) => a.w - b.w)
  const pick = byWidth.find((c) => c.w >= drawn * 2) ?? byWidth.at(-1)!
  return new URL(pick.u, 'https://site.test')
}

describe.each([
  ['with the optimizer on', '0'],
  ['with the optimizer switched off, as live', '1'],
])('a pasted Unsplash photo, %s', (_, off) => {
  it('on a home tile is fetched from Unsplash at tile sizes', () => {
    vi.stubEnv('NEXT_PUBLIC_IMAGES_UNOPTIMIZED', off)
    const { container } = render(<div style={{ position: 'relative' }}><TilePhoto src={PASTED} /></div>)
    const urls = candidates(container.querySelector('img')!)
    for (const u of urls) {
      expect(u.hostname, u.href).toBe('plus.unsplash.com')
      expect(Number(u.searchParams.get('w')), u.href).toBeLessThanOrEqual(1920)
    }
    expect(Number(fetched(container.querySelector('img')!, 108).searchParams.get('w'))).toBeLessThanOrEqual(384)
  })

  it('as a listing’s picture is fetched at its avatar size', () => {
    vi.stubEnv('NEXT_PUBLIC_IMAGES_UNOPTIMIZED', off)
    const { container } = render(<CategoryIcon icon="" color="#123456" iconImageUrl={PASTED} sizePx={40} />)
    const urls = candidates(container.querySelector('img')!)
    expect(urls.every((u) => u.hostname === 'plus.unsplash.com')).toBe(true)
    expect(Number(fetched(container.querySelector('img')!, 40).searchParams.get('w'))).toBeLessThanOrEqual(96)
  })
})
