import type { Metadata, Viewport } from 'next'
import { Figtree } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { community } from '@/community.config'
import './globals.css'

const figtree = Figtree({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: community.name,
  description: community.mission,
  manifest: '/manifest.webmanifest',
  // Standalone "Add to Home Screen" experience on iOS.
  appleWebApp: {
    capable: true,
    title: community.shortName,
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  themeColor: community.themeColor,
  // Let content extend into the notch / home-indicator areas so our own
  // safe-area padding (globals.css + sticky headers) can manage the insets.
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={figtree.className}
      // Brand color is single-sourced from community.config: override the
      // Tailwind `primary` utilities' variable at runtime so it always matches
      // `themeColor` (browser chrome / manifest). globals.css holds only a
      // build-time fallback. `--color-primary-dark` derives from this in CSS.
      style={{ '--color-primary': community.themeColor } as React.CSSProperties}
    >
      <body className="bg-surface text-slate-900 antialiased min-h-screen flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
