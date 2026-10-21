'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Briefcase,
  CalendarDays,
  ClipboardList,
  FileText,
  Inbox,
  LayoutDashboard,
  Send,
  Settings,
  UserRound,
  Users,
} from 'lucide-react';
import { cn } from './ui';

const groups = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/approvals', label: 'Approvals', icon: Inbox, badge: 'approvals' as const },
    ],
  },
  {
    label: 'Pipeline',
    items: [
      { href: '/jobs', label: 'Jobs', icon: Briefcase },
      { href: '/applications', label: 'Applications', icon: ClipboardList },
    ],
  },
  {
    label: 'Reach out',
    items: [
      { href: '/contacts', label: 'Contacts', icon: Users },
      { href: '/outreach', label: 'Outreach', icon: Send },
    ],
  },
  {
    label: 'Candidate',
    items: [
      { href: '/resume', label: 'Resume', icon: FileText },
      { href: '/profile', label: 'Profile', icon: UserRound },
      { href: '/interviews', label: 'Interviews', icon: CalendarDays },
    ],
  },
  {
    label: 'Insight',
    items: [
      { href: '/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function Sidebar({ approvals }: { approvals: number }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-ink-800/60 bg-ink-950 text-ink-200 lg:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <img
          src="/brand/vulcaestus-mark-light.png"
          alt="Vulcaestus"
          className="h-9 w-9 object-contain"
        />
        <div>
          <p className="text-sm font-semibold tracking-tight text-white">Vulcaestus</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-ink-500">Private workspace</p>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-600">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition',
                      active
                        ? 'bg-ink-800 text-white shadow-sm'
                        : 'text-ink-400 hover:bg-ink-900 hover:text-ink-100',
                    )}
                  >
                    <Icon className={cn('h-4 w-4', active ? 'text-accent-400' : 'text-ink-500 group-hover:text-ink-300')} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge === 'approvals' && approvals > 0 ? (
                      <span className="rounded-full bg-accent-500 px-1.5 py-0.5 text-[10px] font-bold text-ink-950">
                        {approvals}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-ink-800/60 px-5 py-4 text-[10px] leading-relaxed text-ink-600">
        Human approval required
        <br />
        for every external action.
      </div>
    </aside>
  );
}

const mobileItems = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/applications', label: 'Apps', icon: ClipboardList },
  { href: '/approvals', label: 'Approvals', icon: Inbox },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-ink-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {mobileItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-semibold',
              active ? 'text-accent-700' : 'text-ink-500',
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
