'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { adminAreas, adminNavPosition, type AdminArea } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { useSiteSettings } from '@/lib/contentContext'

// The console's frame (the admin redesign's step 1, boards 1, 2, 5, 10 and
// 11): on a computer a sidebar with the four areas, then Settings and View
// the site at the bottom; on a phone a bar at the top with the screen's name
// and a gear, and the four areas along the bottom. Every screen gets the
// open area's name as its heading, and the area's pages as tabs under it.
// Site is for a computer, so on a phone it says so instead.

const ICONS: Record<AdminArea | 'view', React.ReactNode> = {
  todo: <path d="M3 8.5l3 3 7-7" />,
  places: (
    <>
      <path d="M8 14.5s5-4.5 5-8.5A5 5 0 0 0 3 6c0 4 5 8.5 5 8.5z" />
      <circle cx="8" cy="6" r="1.8" />
    </>
  ),
  site: (
    <>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M2 6.5h12" />
    </>
  ),
  reports: <path d="M3 13.5V8.5M8 13.5V3M13 13.5V6" />,
  settings: (
    <>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
    </>
  ),
  view: <path d="M9 3h4v4M13 3L7 9M11 9.5V13H3V5h3.5" />,
}

function Icon({ name, size = 16 }: { name: AdminArea | 'view'; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="shrink-0">
      {ICONS[name]}
    </svg>
  )
}

const sideLink = (current: boolean) =>
  `flex items-center gap-2.5 p-2.5 rounded-lg min-h-11 text-[14.5px] ${
    current ? 'bg-primary/10 text-primary font-bold' : 'text-slate-700 font-semibold hover:bg-slate-50'
  }`

export default function AdminFrame({
  children,
  isSuperAdmin,
  email,
  onSignOut,
}: {
  children: React.ReactNode
  isSuperAdmin: boolean
  email: string | undefined
  onSignOut: () => void
}) {
  const pathname = usePathname()
  const community = useCommunitySlug()
  const siteName = useSiteSettings().name
  const areas = adminAreas(community, isSuperAdmin)
  const position = adminNavPosition(pathname, community, isSuperAdmin)
  const open = areas.find((a) => a.area === position?.area)
  const main = areas.filter((a) => a.area !== 'settings')
  const settings = areas.find((a) => a.area === 'settings')!
  const siteHref = `/${community}`
  const showTabs = open && (open.tabs.length > 1 || open.tabs[0].label !== open.label)

  const account = (
    <div className="flex flex-col gap-1 px-2.5 pt-3 text-[13px] text-slate-600">
      <p className="m-0 break-all">
        Signed in as <span className="font-medium text-slate-700">{email}</span>
      </p>
      <button type="button" onClick={onSignOut} className="self-start min-h-11 font-semibold text-primary cursor-pointer">
        Sign out
      </button>
    </div>
  )

  return (
    <div className="flex-1 flex w-full min-w-0">
      <nav
        aria-label="Admin"
        className="hidden md:flex w-60 shrink-0 flex-col gap-1 bg-white border-r border-slate-200 px-3 py-5 sticky top-0 h-dvh overflow-y-auto"
      >
        <div className="flex flex-col px-2.5 pt-1 pb-4">
          <span className="text-[15px] font-bold text-slate-900">{siteName}</span>
          <span className="text-[12.5px] text-slate-500">Admin</span>
        </div>
        {main.map((a) => (
          <Link key={a.area} href={a.href} aria-current={a.area === open?.area ? 'page' : undefined} className={sideLink(a.area === open?.area)}>
            <Icon name={a.area} />
            <span className="flex-1">{a.label}</span>
          </Link>
        ))}
        <div className="flex-1 min-h-6" />
        <Link href={settings.href} aria-current={open?.area === 'settings' ? 'page' : undefined} className={sideLink(open?.area === 'settings')}>
          <Icon name="settings" />
          <span className="flex-1">{settings.label}</span>
        </Link>
        <Link href={siteHref} className={sideLink(false)}>
          <Icon name="view" />
          <span className="flex-1">View the site</span>
        </Link>
        {account}
      </nav>

      <main className="flex-1 min-w-0 px-4 pb-28 md:px-10 md:pt-8 md:pb-12">
        <div className="max-w-[920px] flex flex-col gap-4">
          <header className="-mx-4 flex items-center gap-2.5 bg-white border-b border-slate-200 px-4 py-3 md:mx-0 md:p-0 md:bg-transparent md:border-0">
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="md:hidden text-[12.5px] text-slate-500">{siteName}</span>
              <h1 className="m-0 text-xl md:text-[26px] font-bold text-slate-900">{open?.label ?? 'Admin'}</h1>
            </span>
            <Link href={settings.href} aria-label="Settings" className="md:hidden inline-flex items-center justify-center w-11 h-11 text-slate-700">
              <Icon name="settings" size={20} />
            </Link>
          </header>

          {showTabs && (
            <nav aria-label={open.label} className="flex gap-1 overflow-x-auto touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-b border-slate-200">
              {open.tabs.map((t) => {
                const current = t.tab === position?.tab
                return (
                  <Link
                    key={t.tab}
                    href={t.href}
                    aria-current={current ? 'page' : undefined}
                    className={`shrink-0 whitespace-nowrap text-sm font-semibold px-3 py-2.5 min-h-11 -mb-px border-b-2 ${
                      current ? 'border-primary text-primary' : 'border-transparent text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    {t.label}
                  </Link>
                )
              })}
            </nav>
          )}

          {open?.area === 'site' ? (
            <>
              <div className="md:hidden bg-white border border-slate-200 rounded-[10px] px-4 py-5 flex flex-col items-start gap-3.5">
                <p className="m-0 text-base font-bold text-slate-900">Open on a computer to edit the site</p>
                <Link href={siteHref} className="inline-flex items-center min-h-11 px-4 rounded-lg border border-slate-300 bg-white text-[14.5px] font-semibold text-slate-900">
                  View the site
                </Link>
              </div>
              <div className="hidden md:block">{children}</div>
            </>
          ) : (
            <div>{children}</div>
          )}

          {open?.area === 'settings' && <div className="md:hidden">{account}</div>}
        </div>
      </main>

      <nav
        aria-label="Admin areas"
        className="md:hidden fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 bg-white border-t border-slate-200 px-1 pt-1.5 pb-[max(10px,env(safe-area-inset-bottom))]"
      >
        {main.map((a) => {
          const current = a.area === open?.area
          return (
            <Link
              key={a.area}
              href={a.href}
              aria-current={current ? 'page' : undefined}
              className={`flex flex-col items-center gap-[3px] py-1.5 min-h-11 text-xs ${current ? 'text-primary font-bold' : 'text-slate-600 font-semibold'}`}
            >
              <Icon name={a.area} size={20} />
              {a.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
