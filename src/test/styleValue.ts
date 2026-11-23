// A CSS value as an element's style gives it back. jsdom 31 (Nov 22)
// simplifies values the way browsers do (`translateY(0)` comes back
// `translateY(0px)`, a `calc()` folded into the `clamp()` around it), so
// a test comparing a style it read with the string the code wrote passes
// only on the jsdom it was written against. Run the expected value through
// the same parser and the comparison holds on any of them.
export function styleValue(property: string, value: string): string {
  const el = document.createElement('div')
  el.style.setProperty(property, value)
  return el.style.getPropertyValue(property)
}
