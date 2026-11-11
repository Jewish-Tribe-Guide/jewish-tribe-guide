'use client'

import { useMemo } from 'react'
import { DEFAULT_LINE_COLOR, readableLines, shownMap, type EruvLineFile } from '@/lib/eruvLine'

/** An eruv's map drawn small, as the guide shows it: each line in the
 *  eruv's colour (a too-pale one darkened, as on the site), a left-out one
 *  dashed and grey, and its markers as dots. Moved from the Eruv page into
 *  Places' Map row on Nov 9. */
export default function EruvMapPreview({ file: theirs, leaveOut, hideMarks }: { file: EruvLineFile; leaveOut: string[]; hideMarks: boolean }) {
  const file = useMemo(() => readableLines(theirs), [theirs])
  const shown = useMemo(() => shownMap(file, leaveOut, hideMarks), [file, leaveOut, hideMarks])
  const pts = [...file.lines.flatMap((l) => l.points), ...(file.marks ?? []).map((m) => m.at)]
  if (pts.length === 0) return null
  const lats = pts.map((p) => p[0])
  const lngs = pts.map((p) => p[1])
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
  const w = (maxLng - minLng) * k || 1e-6
  const h = maxLat - minLat || 1e-6
  const W = 320
  const H = Math.max(120, Math.min(320, (W * h) / w))
  const s = Math.min((W - 16) / w, (H - 16) / h)
  const x = (lng: number) => 8 + (lng - minLng) * k * s
  const y = (lat: number) => H - 8 - (lat - minLat) * s
  const xy = ([lat, lng]: [number, number]) => `${x(lng).toFixed(1)},${y(lat).toFixed(1)}`
  const kept = new Set(shown.lines)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="max-w-full rounded-lg border border-slate-200 bg-slate-50" role="img" aria-label="The eruv’s map, as the guide shows it" data-testid="eruv-map-preview">
      {shown.lines
        .filter((l) => l.fill)
        .map((l, i) => (
          <polygon key={`a${i}`} points={l.points.map(xy).join(' ')} fill={l.fill!.color} fillOpacity={l.fill!.opacity} stroke="none" />
        ))}
      {file.lines.map((l, i) => (
        <polyline key={i} points={l.points.map(xy).join(' ')} fill="none" stroke={kept.has(l) ? (l.color ?? DEFAULT_LINE_COLOR) : '#94a3b8'} strokeWidth={kept.has(l) ? 2 : 1.5} strokeDasharray={kept.has(l) ? undefined : '3 3'} />
      ))}
      {(shown.marks ?? []).map((m, i) => (
        <circle key={`m${i}`} cx={x(m.at[1])} cy={y(m.at[0])} r={3.5} fill={m.color ?? '#0288d1'} stroke="#fff" strokeWidth={1} />
      ))}
    </svg>
  )
}
