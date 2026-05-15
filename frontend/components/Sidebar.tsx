'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  {
    label: 'Overview',
    href: '/dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    label: 'News',
    href: '/dashboard/news',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
        <path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m2 13a2 2 0 0 1-2-2V7m2 13a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
      </svg>
    ),
    badge: 'LIVE',
  },
  {
    label: 'Positions',
    href: '/dashboard/positions',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    label: 'Telegram Bot',
    href: '/dashboard/telegram',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-1.97 9.269c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.062 13.67l-2.99-.937c-.65-.204-.662-.65.136-.964l11.677-4.501c.54-.194 1.017.133.842.98z"/>
      </svg>
    ),
  },
  {
    label: 'AI Suggestions',
    href: '/dashboard/ai',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar-container fixed left-0 top-0 z-40 flex h-screen w-[72px] flex-col items-center border-r border-white/5 bg-[#060a0a]/90 backdrop-blur-xl py-5 transition-all duration-300 hover:w-[220px] group/sidebar">
      {/* Logo */}
      <Link href="/" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 border border-accent/20 mb-8 transition hover:bg-accent/20">
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-accent" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </Link>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1.5 w-full px-3">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 ${
                isActive
                  ? 'bg-accent/10 text-accent shadow-[inset_0_0_0_1px_rgba(0,242,255,0.15)]'
                  : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[13.5px] h-5 w-[3px] rounded-r-full bg-accent" />
              )}
              <span className="shrink-0">{item.icon}</span>
              <span className="sidebar-label font-mono text-xs font-semibold tracking-wide whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">
                {item.label}
              </span>
              {item.badge && (
                <span className="sidebar-label ml-auto rounded-full bg-safe/15 border border-safe/25 px-2 py-0.5 font-mono text-[9px] font-bold text-safe tracking-widest opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* SoSo DEX Connect */}
      <div className="w-full px-3 mt-auto">
        <a
          href="https://app.sodex.com"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-accent/10 to-magenta/10 border border-accent/15 px-3 py-2.5 transition-all hover:border-accent/30 hover:shadow-[0_0_20px_rgba(0,242,255,0.1)]"
        >
          <span className="shrink-0">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-accent" stroke="currentColor" strokeWidth="1.8">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </span>
          <span className="sidebar-label font-mono text-[10px] font-bold tracking-wider text-accent whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">
            SoSo DEX
          </span>
        </a>
      </div>
    </aside>
  );
}
