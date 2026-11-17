'use client'

import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { fitTitleSize, headerTitleSize } from '@/lib/headerTitleSize'

/** Two lines, cut only after the second. */
function wrap(el: HTMLElement, on: boolean) {
  el.style.whiteSpace = on ? 'normal' : ''
  el.style.display = on ? '-webkit-box' : ''
  el.style.setProperty('-webkit-line-clamp', on ? '2' : '')
  el.style.setProperty('-webkit-box-orient', on ? 'vertical' : '')
}

/** The phone header's title, as big as fits beside what's next to it (see
 *  headerTitleSize). Measured after it draws and whenever its room changes;
 *  `className` must truncate, and sets the computer size (`desktop:text-…`),
 *  which wins there. */
export function FitTitle({ text, className, testId }: { text: string; className: string; testId?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      wrap(el, false)
      const fits = (size: number) => {
        el.style.setProperty('--title-size', `${size}px`)
        return el.scrollWidth <= el.clientWidth
      }
      const px = fitTitleSize(fits)
      // Too long even at the smallest: two lines rather than cut off
      // ("Candle Lighting & Zmanim" on a 320px phone).
      if (!fits(px)) wrap(el, true)
    }
    fit()
    if (typeof ResizeObserver === 'undefined' || !el.parentElement) return
    const watch = new ResizeObserver(fit)
    watch.observe(el.parentElement)
    return () => watch.disconnect()
  }, [text])
  return (
    <span ref={ref} data-testid={testId} style={{ '--title-size': `${headerTitleSize(text)}px` } as CSSProperties} className={`text-[length:var(--title-size)] ${className}`}>
      {text}
    </span>
  )
}
