import type { EruvTone } from '@/lib/eruv'

// An eruv's status colours, one place for every screen that shows one: the
// eruv card, the nearest eruv on Today, a search line, a saved eruv on You.
// They were copied into each until Oct 15.

/** The dot before the status. */
export const TONE_DOT: Record<EruvTone, string> = { green: 'bg-green-700', amber: 'bg-amber-700', red: 'bg-red-700', grey: 'bg-slate-500' }
/** The status words themselves. */
export const TONE_WORDS: Record<EruvTone, string> = { green: 'text-green-700', amber: 'text-amber-700', red: 'text-red-700', grey: 'text-slate-700' }
