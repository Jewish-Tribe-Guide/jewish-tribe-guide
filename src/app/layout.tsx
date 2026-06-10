import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Philadelphia Jewish Community',
  description: 'Connecting patients, families, and neighbors with Philadelphia\'s Jewish community resources',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface text-slate-900 antialiased min-h-screen">{children}</body>
    </html>
  )
}
