// Makes a community's picture for the computer home's "Everything on one map"
// card: an OpenStreetMap street map around the community's map centre, framed
// about as wide as the map page first opens, with the centre placed in the
// open right side of the card (the words cover the left), and fading to the
// card's ground under the words. The user chose this
// over a photo and over Google's Static Maps on Nov 11 ("OSM, farther out").
//
// It is one saved picture, made once: the home never loads tiles. That is
// within OpenStreetMap's tile policy, which also asks for a visible credit, so
// the picture is saved with `credit: '© OpenStreetMap contributors'` and the
// card shows it. An admin who later uploads their own photo replaces both.
//
//   node --env-file=.env.local scripts/map-card-picture.mjs philly                   # dry run: makes the picture, writes it locally
//   node --env-file=.env.local scripts/map-card-picture.mjs philly --apply           # uploads it and sets it, dev/test
//   node --env-file=.env.local scripts/map-card-picture.mjs philly --prod            # dry run against production's centre
//   node --env-file=.env.local scripts/map-card-picture.mjs philly --prod --apply    # uploads it and sets it on production
//
// Production only with --prod, from PROD_SUPABASE_URL / _SERVICE_ROLE_KEY, the
// same pair sync-dev-from-prod.mjs uses. Needs migration 095
// (site_settings.desktop_map_image) on the target.
//
// A write straight to the database skips the cache invalidation an admin save
// does, so the site keeps the old card until the cache turns over: redeploy, or
// POST /api/admin/revalidate (AGENTS.md, "Invalidation").

import { pathToFileURL } from 'node:url'
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

export const CREDIT = '© OpenStreetMap contributors'
/** The card is 1120×540 at its widest; the picture is made at twice that. */
export const WIDTH = 2240
export const HEIGHT = 1080
/** About as wide as the map page's first view of a community. */
export const ZOOM = 12
/** The centre sits 70% across, right of the card's words. */
export const SHIFT = 0.2
const TILE = 256

/** The left of the card is under its words and an almost solid white fade,
 *  so the picture fades there itself: plain ground compresses far better
 *  than streets do, and the street map came out 180 KB on the home (its
 *  budget is 150) until it did. Plain to 30% across, the map from 46%. */
export const FADE = { plainTo: 0.3, mapFrom: 0.46, colour: '#f8fafc' }
export function fadeOverlay(width = WIDTH, height = HEIGHT) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="f" x1="0" x2="1" y1="0" y2="0">` +
    `<stop offset="${FADE.plainTo}" stop-color="${FADE.colour}" stop-opacity="1"/><stop offset="${FADE.mapFrom}" stop-color="${FADE.colour}" stop-opacity="0"/>` +
    `</linearGradient></defs><rect width="100%" height="100%" fill="url(#f)"/></svg>`
}

/** Web Mercator pixel of a point at a zoom. */
export function worldPixel({ lat, lng }, zoom) {
  const n = 2 ** zoom * TILE
  const x = ((lng + 180) / 360) * n
  const y = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n
  return { x, y }
}

/** The tiles covering the picture and where each lands in it, its top-left
 *  corner chosen so `center` falls (0.5 + shift) of the way across. */
export function tilesFor(center, { zoom = ZOOM, width = WIDTH, height = HEIGHT, shift = SHIFT } = {}) {
  const c = worldPixel(center, zoom)
  const x0 = c.x - shift * width - width / 2
  const y0 = c.y - height / 2
  const tiles = []
  for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x0 + width - 1) / TILE); tx++) {
    for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y0 + height - 1) / TILE); ty++) {
      tiles.push({ z: zoom, x: tx, y: ty, left: Math.round(tx * TILE - x0), top: Math.round(ty * TILE - y0) })
    }
  }
  return tiles
}

async function fetchTile({ z, x, y }) {
  const res = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
    headers: { 'User-Agent': 'community-guide-map-card/1.0 (one picture per community, made once)' },
  })
  if (!res.ok) throw new Error(`Tile ${z}/${x}/${y}: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function main() {
  const slug = process.argv.slice(2).find((a) => !a.startsWith('--'))
  const APPLY = process.argv.includes('--apply')
  const PROD = process.argv.includes('--prod')
  if (!slug) throw new Error('Name the community: map-card-picture.mjs <slug>')

  const url = PROD ? process.env.PROD_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = PROD ? process.env.PROD_SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(PROD ? 'Needs PROD_SUPABASE_URL and PROD_SUPABASE_SERVICE_ROLE_KEY.' : 'Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  }
  console.log(`\nTarget:  ${PROD ? 'PRODUCTION' : 'dev/test'} (${new URL(url).host})`)

  const db = createClient(url, key)
  const { data: community, error } = await db.from('community').select('slug,name,region,map_center').eq('slug', slug).maybeSingle()
  if (error) throw error
  if (!community?.map_center) throw new Error(`No map centre for "${slug}".`)
  console.log(`Centre:  ${community.map_center.lat}, ${community.map_center.lng} (${community.name})`)

  const tiles = tilesFor(community.map_center)
  console.log(`Tiles:   ${tiles.length} at zoom ${ZOOM}`)
  const sharp = (await import('sharp')).default
  const parts = []
  for (const t of tiles) {
    const v = visiblePart(t)
    const tile = await fetchTile(t)
    parts.push({ input: await sharp(tile).extract({ left: v.cropLeft, top: v.cropTop, width: v.width, height: v.height }).toBuffer(), left: v.left, top: v.top })
  }
  const picture = await sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: '#f2efe9' } })
    .composite([...parts, { input: Buffer.from(fadeOverlay()), left: 0, top: 0 }])
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer()

  const local = `map-card-${slug}.jpg`
  writeFileSync(local, picture)
  console.log(`Picture: ${local} (${Math.round(picture.length / 1024)} KB), credit "${CREDIT}"`)

  const { data: row } = await db.from('site_settings').select('desktop_map_image').eq('community_id', slug).maybeSingle()
  console.log(`Now:     ${row?.desktop_map_image ? JSON.stringify(row.desktop_map_image) : 'no picture'}`)
  if (!APPLY) {
    console.log('\nDry run: nothing uploaded or set. Add --apply to.')
    return
  }

  const path = `map/${slug}-osm-${Date.now()}.jpg`
  const up = await db.storage.from('site-assets').upload(path, picture, { contentType: 'image/jpeg' })
  if (up.error) throw up.error
  const publicUrl = db.storage.from('site-assets').getPublicUrl(path).data.publicUrl
  const value = { url: publicUrl, alt: `Street map of ${community.region || community.name}`, credit: CREDIT }
  const set = await db.from('site_settings').update({ desktop_map_image: value }).eq('community_id', slug).select('community_id')
  if (set.error) throw set.error
  if (!set.data?.length) throw new Error(`No site settings row for "${slug}" to set the picture on.`)
  console.log(`Set:     ${JSON.stringify(value)}`)
  console.log('The site shows it once its cache turns over: redeploy, or POST /api/admin/revalidate.')
}

/** The part of a tile inside the picture: sharp's composite refuses an input
 *  that hangs off any edge, so edge tiles are cut down first. */
export function visiblePart({ left, top }, width = WIDTH, height = HEIGHT) {
  const cropLeft = Math.max(0, -left)
  const cropTop = Math.max(0, -top)
  return {
    cropLeft,
    cropTop,
    left: left + cropLeft,
    top: top + cropTop,
    width: Math.min(TILE, width - left) - cropLeft,
    height: Math.min(TILE, height - top) - cropTop,
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message ?? err)
    process.exit(1)
  })
}
