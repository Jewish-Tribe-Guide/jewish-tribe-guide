// Lights up, in the preview beside Site's settings, the part of the page the
// box being worked on changes (the user, Oct 31: "what does what"). The site
// marks its parts with data-spot, a space-separated list of names; nothing
// reads the mark but this. The preview is the real page in a same-origin
// frame, so this reaches in rather than the page having a mode of its own.

const LIT = 'data-spot-lit'
const STYLE_ID = 'preview-spot-style'
// Inside the part's edge: the top of the page runs off both sides of it.
const CSS = `[${LIT}] { outline: 8px solid #2563eb; outline-offset: -8px; }`

/** Lights every part named `spot` and brings the first into view, unlighting whatever was. False if
 *  the page has no such part showing: not yet drawn, or not on this device
 *  (a part hidden by a media query has no height, and a wrapper round one
 *  keeps a box of no height). */
export function lightSpot(doc: Document, spot: string | null): boolean {
  for (const el of doc.querySelectorAll(`[${LIT}]`)) el.removeAttribute(LIT)
  if (!spot) return true
  const parts = [...doc.querySelectorAll(`[data-spot~="${spot}"]`)].filter((e) => e.getBoundingClientRect().height > 0)
  if (parts.length === 0) return false
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style')
    style.id = STYLE_ID
    style.textContent = CSS
    doc.head.append(style)
  }
  for (const part of parts) part.setAttribute(LIT, '')
  // The frame's own window, not scrollIntoView: that scrolls every page around
  // the frame too, and the settings would jump out from under the mouse.
  const win = doc.defaultView
  const box = parts[0].getBoundingClientRect()
  win?.scrollTo({ top: win.scrollY + box.top + box.height / 2 - win.innerHeight / 2 })
  return true
}
