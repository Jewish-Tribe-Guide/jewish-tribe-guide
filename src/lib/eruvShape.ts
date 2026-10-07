import type { EruvLineFile, LatLng } from './eruvLine'

// ── Inside an eruv, or at its edge (Oct 7) ──────────────────────────────────
// An eruv publishes its line as pieces (Center City: 31), not as an area:
// "Washington Border", "Front St Border", a connector over the South Street
// Bridge. To say whether someone is inside, the pieces are joined into the
// areas they enclose:
//
//   1. Every crossing and shared point becomes a junction (points within a
//      few metres are the same point: one file writes 7 decimals, another
//      13).
//   2. A loose end within GAP metres of another loose end is joined to it:
//      Center City's file leaves gaps of 50 and 290 metres along the south
//      of its South Philadelphia part, where the line is a wall or a fence
//      no one drew. These joins are guesses, so they're returned for the
//      admin to look at before the line is used, and standing near one
//      counts as being at the edge.
//      A loose end within T_GAP metres of another line joins it the same way.
//   3. Ends still loose (a connector to the next eruv) are dropped.
//   4. The areas the remaining lines enclose are the eruv.
//
// whereIs then answers "inside" only when the point is in one of those areas
// AND further from every line than the phone's accuracy (and never less
// than EDGE_MIN): a street on the line counts as outside, and a phone's
// location can be off by a block. "edge" otherwise near a line; "outside"
// elsewhere.

const SNAP_M = 8
const GAP_M = 400
const T_GAP_M = 150
export const EDGE_MIN_M = 30

type XY = [number, number]

function projector(points: LatLng[]): { to: (p: LatLng) => XY; back: (p: XY) => LatLng } {
  const lat0 = points.reduce((s, p) => s + p[0], 0) / Math.max(points.length, 1)
  const lng0 = points.reduce((s, p) => s + p[1], 0) / Math.max(points.length, 1)
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180)
  const ky = 110_540
  return { to: ([lat, lng]) => [(lng - lng0) * kx, (lat - lat0) * ky], back: ([x, y]) => [y / ky + lat0, x / kx + lng0] }
}

function segIntersection(a: XY, b: XY, c: XY, d: XY): XY | null {
  const r: XY = [b[0] - a[0], b[1] - a[1]]
  const s: XY = [d[0] - c[0], d[1] - c[1]]
  const den = r[0] * s[1] - r[1] * s[0]
  if (Math.abs(den) < 1e-9) return null
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den
  if (t <= 1e-9 || t >= 1 - 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null
  return [a[0] + t * r[0], a[1] + t * r[1]]
}

function distToSegment(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

function area(ring: XY[]): number {
  let s = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    s += x1 * y2 - x2 * y1
  }
  return s / 2
}

function inRing(p: XY, ring: XY[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export type EruvShape = {
  /** The areas the eruv encloses. */
  areas: LatLng[][]
  /** Gaps in the published line the guide joined, for an admin to check. */
  joins: [LatLng, LatLng][]
}

type Built = {
  areas: XY[][]
  joins: [XY, XY][]
  /** The lines that border the outside, and the loose connectors. */
  edges: [XY, XY][]
  proj: ReturnType<typeof projector>
}

function build(file: EruvLineFile): Built {
  const all = file.lines.flatMap((l) => l.points)
  const proj = projector(all)
  const polylines = file.lines.map((l) => l.points.map(proj.to))
  const segments: [XY, XY][] = polylines.flatMap((pl) => pl.slice(1).map((p, i) => [pl[i], p] as [XY, XY]))

  // 1 · Split each segment at every crossing, then snap points together.
  const cuts: XY[][] = segments.map(([a, b]) => [a, b])
  for (let i = 0; i < segments.length; i++) {
    const [a, b] = segments[i]
    for (let j = i + 1; j < segments.length; j++) {
      const [c, d] = segments[j]
      if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) - SNAP_M || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) - SNAP_M) continue
      if (Math.max(a[1], b[1]) < Math.min(c[1], d[1]) - SNAP_M || Math.max(c[1], d[1]) < Math.min(a[1], b[1]) - SNAP_M) continue
      const x = segIntersection(a, b, c, d)
      if (x) {
        cuts[i].push(x)
        cuts[j].push(x)
      }
      // An end of one touching the middle of the other (a T): split there.
      for (const [p, k, s] of [[c, i, [a, b]], [d, i, [a, b]], [a, j, [c, d]], [b, j, [c, d]]] as [XY, number, [XY, XY]][]) {
        if (distToSegment(p, s[0], s[1]) < SNAP_M) cuts[k].push(p)
      }
    }
  }
  const nodes: XY[] = []
  const nodeOf = (p: XY): number => {
    for (let k = 0; k < nodes.length; k++) if (Math.hypot(nodes[k][0] - p[0], nodes[k][1] - p[1]) < SNAP_M) return k
    nodes.push(p)
    return nodes.length - 1
  }
  const adj = new Map<number, Set<number>>()
  const link = (u: number, v: number) => {
    if (u === v) return
    if (!adj.has(u)) adj.set(u, new Set())
    if (!adj.has(v)) adj.set(v, new Set())
    adj.get(u)!.add(v)
    adj.get(v)!.add(u)
  }
  cuts.forEach((pts, i) => {
    const [a, b] = segments[i]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const t = (p: XY) => ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)
    const ids = [...pts].sort((p, q) => t(p) - t(q)).map(nodeOf)
    for (let k = 1; k < ids.length; k++) link(ids[k - 1], ids[k])
  })

  // 2 · Join loose ends that are nearest each other and close enough.
  const loose = () => [...adj].filter(([, s]) => s.size === 1).map(([k]) => k)
  const joins: [XY, XY][] = []
  const ends = loose()
  const nearest = (k: number) => {
    let best = -1
    let bestD = Infinity
    for (const m of ends) {
      if (m === k || adj.get(k)!.has(m)) continue
      const d = Math.hypot(nodes[k][0] - nodes[m][0], nodes[k][1] - nodes[m][1])
      if (d < bestD) [best, bestD] = [m, d]
    }
    return { best, bestD }
  }
  for (const k of ends) {
    const { best, bestD } = nearest(k)
    if (best > k && bestD <= GAP_M && nearest(best).best === k) {
      link(k, best)
      joins.push([nodes[k], nodes[best]])
    }
  }
  // A loose end that stops short of a line (Center City's Grays Ferry
  // piece ends 80 m from the 25th Street line it meets) joins the nearest
  // point on it, if that's within T_GAP.
  for (const k of loose()) {
    let best: { u: number; v: number; at: XY; d: number } | null = null
    for (const [u, s] of adj) {
      for (const v of s) {
        if (u > v || u === k || v === k || adj.get(k)!.has(u) || adj.get(k)!.has(v)) continue
        const [a, b] = [nodes[u], nodes[v]]
        const dx = b[0] - a[0]
        const dy = b[1] - a[1]
        const t = Math.max(0, Math.min(1, ((nodes[k][0] - a[0]) * dx + (nodes[k][1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
        const at: XY = [a[0] + t * dx, a[1] + t * dy]
        const d = Math.hypot(at[0] - nodes[k][0], at[1] - nodes[k][1])
        if (d <= T_GAP_M && (!best || d < best.d)) best = { u, v, at, d }
      }
    }
    if (!best) continue
    const w = nodeOf(best.at)
    if (w !== best.u && w !== best.v) {
      adj.get(best.u)!.delete(best.v)
      adj.get(best.v)!.delete(best.u)
      link(best.u, w)
      link(w, best.v)
    }
    link(k, w)
    joins.push([nodes[k], nodes[w]])
  }

  // 3 · Drop what's still loose. Kept aside as lines: standing on a
  // connector (the South Street Bridge) is standing at an edge.
  const loosePieces: [XY, XY][] = []
  for (let ks = loose(); ks.length; ks = loose()) {
    for (const k of ks) for (const m of adj.get(k) ?? []) loosePieces.push([nodes[k], nodes[m]])
    for (const k of ks) {
      for (const m of adj.get(k) ?? []) adj.get(m)?.delete(k)
      adj.delete(k)
    }
  }

  // 4 · The enclosed areas: walk every edge's left side round its face.
  const angle = (u: number, v: number) => Math.atan2(nodes[v][1] - nodes[u][1], nodes[v][0] - nodes[u][0])
  const around = new Map<number, number[]>()
  for (const [u, s] of adj) around.set(u, [...s].sort((v, w) => angle(u, v) - angle(u, w)))
  const seen = new Set<string>()
  const areas: XY[][] = []
  // Each side of each line, and whether that side is an enclosed area: a
  // line with an area on both sides (Washington Avenue, between Center City
  // and South Philadelphia) is inside, not an edge.
  const enclosedSide = new Set<string>()
  for (const [u, s] of adj) {
    for (const v0 of s) {
      if (seen.has(`${u}>${v0}`)) continue
      const ring: number[] = []
      let [a, b] = [u, v0]
      for (let guard = 0; guard < 100_000 && !seen.has(`${a}>${b}`); guard++) {
        seen.add(`${a}>${b}`)
        ring.push(a)
        const list = around.get(b)!
        const i = list.indexOf(a)
        // The next edge clockwise from the way back keeps the face on the left.
        const next = list[(i - 1 + list.length) % list.length]
        ;[a, b] = [b, next]
      }
      const pts = ring.map((k) => nodes[k])
      if (area(pts) > 100) {
        areas.push(pts)
        ring.forEach((k, i) => enclosedSide.add(`${k}>${ring[(i + 1) % ring.length]}`))
      }
    }
  }
  const edges: [XY, XY][] = [...loosePieces]
  for (const [u, s] of adj) for (const v of s) if (u < v && !(enclosedSide.has(`${u}>${v}`) && enclosedSide.has(`${v}>${u}`))) edges.push([nodes[u], nodes[v]])
  return { areas, joins, edges, proj }
}

/** The areas an eruv's line encloses, and the gaps joined to make them. */
export function shapeOf(file: EruvLineFile): EruvShape {
  const b = build(file)
  return { areas: b.areas.map((r) => r.map(b.proj.back)), joins: b.joins.map(([p, q]) => [b.proj.back(p), b.proj.back(q)]) }
}

export type Where = 'inside' | 'edge' | 'outside'

/** Where `point` is, for a phone that says it's accurate to `accuracyM`. */
export function whereIs(point: LatLng, accuracyM: number | null, file: EruvLineFile, shape?: Built): Where {
  const b = shape ?? build(file)
  const p = b.proj.to(point)
  const near = Math.max(accuracyM ?? 0, EDGE_MIN_M)
  if (b.edges.some(([s, t]) => distToSegment(p, s, t) <= near)) return 'edge'
  return b.areas.some((r) => inRing(p, r)) ? 'inside' : 'outside'
}

/** whereIs for many points against one line, building the shape once. */
export function locator(file: EruvLineFile): (point: LatLng, accuracyM: number | null) => Where {
  const b = build(file)
  return (point, accuracyM) => whereIs(point, accuracyM, file, b)
}

/** Where to write the eruv's name: inside its largest area, as far from
 *  that area's line as a coarse search finds (a middle point can fall
 *  outside an L-shaped eruv). Null without an enclosed area. */
export function labelPoint(file: EruvLineFile): LatLng | null {
  const b = build(file)
  const ring = b.areas.reduce<XY[] | null>((best, r) => (!best || Math.abs(area(r)) > Math.abs(area(best)) ? r : best), null)
  if (!ring) return null
  const xs = ring.map((p) => p[0])
  const ys = ring.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const N = 24
  let best: XY | null = null
  let bestD = -1
  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N; j++) {
      const p: XY = [x0 + ((x1 - x0) * i) / N, y0 + ((y1 - y0) * j) / N]
      if (!inRing(p, ring)) continue
      let d = Infinity
      for (let k = 0; k < ring.length && d > bestD; k++) d = Math.min(d, distToSegment(p, ring[k], ring[(k + 1) % ring.length]))
      if (d > bestD) [best, bestD] = [p, d]
    }
  }
  return best ? b.proj.back(best) : null
}
