import type { Metadata } from 'next'
import { Figtree } from 'next/font/google'
import './globals.css'

const figtree = Figtree({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Philadelphia Jewish Community',
  description: 'Connecting patients, families, and neighbors with Philadelphia\'s Jewish community resources',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={figtree.className}>
      <body className="bg-surface text-slate-900 antialiased min-h-screen">{children}</body>
    </html>
  )
}
