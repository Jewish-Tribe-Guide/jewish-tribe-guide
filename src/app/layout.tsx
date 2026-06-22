import type { Metadata, Viewport } from 'next'
import { Figtree } from 'next/font/google'
import './globals.css'

const figtree = Figtree({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Philadelphia Jewish Community',
  description: 'A guide to Jewish Philadelphia — kosher food, synagogues, rides, housing, and community support for residents, visitors, and patients.',
  manifest: '/manifest.webmanifest',
  // Standalone "Add to Home Screen" experience on iOS.
  appleWebApp: {
    capable: true,
    title: 'PJC',
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  themeColor: '#1d4ed8',
  // Let content extend into the notch / home-indicator areas so our own
  // safe-area padding (globals.css + sticky headers) can manage the insets.
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={figtree.className}>
      <body className="bg-surface text-slate-900 antialiased min-h-screen flex flex-col">{children}</body>
    </html>
  )
}
