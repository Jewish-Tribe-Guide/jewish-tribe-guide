'use client'

import { useEffect, useState } from 'react'

/** "On this page" beside Privacy on a computer (board "Privacy and terms"):
 *  every section's heading as a link, the one being read marked. It stays
 *  in view as the page scrolls. Hidden on a phone, where the sections are
 *  rows of their own. */
export default function PageContents({ items }: { items: { id: string; heading: string }[] }) {
  const [current, setCurrent] = useState(items[0]?.id ?? null)

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e)
    if (els.length === 0) return
    // The section being read is the last one whose top has passed a line a
    // third of the way down the window.
    const pick = () => {
      const line = window.innerHeight / 3
      let id = els[0].id
      for (const el of els) if (el.getBoundingClientRect().top <= line) id = el.id
      // At the very bottom, the last section, even when it's too short to
      // reach the line.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) id = els.at(-1)!.id
      setCurrent(id)
    }
    pick()
    window.addEventListener('scroll', pick, { passive: true })
    window.addEventListener('resize', pick)
    return () => {
      window.removeEventListener('scroll', pick)
      window.removeEventListener('resize', pick)
    }
  }, [items])

  return (
    <nav aria-label="On this page" className="sticky top-24 hidden desktop:block">
      <p className="px-3 pb-2 text-[13px] font-bold uppercase tracking-[0.06em] text-slate-500">On this page</p>
      <ul>
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              aria-current={current === i.id ? 'location' : undefined}
              className={`block rounded-lg px-3 py-[7px] text-[15px] ${current === i.id ? 'bg-indigo-100 font-bold text-indigo-900' : 'font-medium text-slate-600 hover:bg-slate-100'}`}
            >
              {i.heading}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
