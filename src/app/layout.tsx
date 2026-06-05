import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Jewish Patient Connect – Philadelphia',
  description: 'Connecting Jewish hospital patients with Philadelphia Jewish community resources',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface text-slate-900 antialiased min-h-screen">{children}</body>
    </html>
  )
}
