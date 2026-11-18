// What an uploaded file is, read from its first bytes rather than the type the
// browser (or a script) put on it. A visitor's photo is stored with the type
// this returns, so a page of HTML labelled image/png is refused instead of
// being kept on the site's own storage (Nov 18 review, item 26).
export type SniffedImage = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

export function imageTypeOf(bytes: Uint8Array): SniffedImage | null {
  const at = (i: number, ...sig: number[]) => sig.every((b, k) => bytes[i + k] === b)
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif' // GIF8
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp' // RIFF....WEBP
  return null
}
