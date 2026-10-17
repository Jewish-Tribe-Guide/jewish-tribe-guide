'use client'

import { createContext, useContext } from 'react'
import type { ChangeLogRow } from './whatChanged'

// The activity log's changes (changesStore), loaded on the server by the two
// pages that show them: the home (Today's "This week" block) and What
// changed. Null outside them, or when the read failed: then nothing is shown,
// rather than a week that looks empty.

const ChangesContext = createContext<ChangeLogRow[] | null>(null)

export function ChangesProvider({ rows, children }: { rows: ChangeLogRow[] | null; children: React.ReactNode }) {
  return <ChangesContext.Provider value={rows}>{children}</ChangesContext.Provider>
}

export function useChangeLog(): ChangeLogRow[] | null {
  return useContext(ChangesContext)
}
