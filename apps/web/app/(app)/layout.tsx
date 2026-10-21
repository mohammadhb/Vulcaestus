import Link from 'next/link';
import { redirect } from 'next/navigation';
import { safeApi } from '@/lib/api';
import type { Me } from '@/lib/types';
import { initials } from '@/lib/format';
import { Badge } from '@/components/ui';
import { Sidebar, MobileNav } from '@/components/sidebar';
import { LogoutButton } from '@/components/logout-button';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await safeApi<Me>('/api/auth/me');
  if (!me) redirect('/login');
  const counts = await safeApi<{ total: number }>('/api/approvals/counts');
  const pending = counts?.total ?? 0;

  return (
    <div className="min-h-screen">
      <Sidebar approvals={pending} />
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-ink-200/80 bg-ink-50/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink-900 lg:hidden">
              <img src="/brand/vulcaestus-mark-dark.png" alt="" className="h-7 w-7 object-contain" />
              Vulcaestus
            </Link>
            <div className="hidden items-center gap-2 text-xs text-ink-500 sm:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-500" />
              </span>
              {me.dryRun ? 'Dry run active — nothing is sent or submitted' : 'Live mode — approvals still required'}
            </div>
            {pending > 0 ? (
              <Link href="/approvals">
                <Badge tone="border-amber-200 bg-amber-50 text-amber-800">{pending} pending approval{pending === 1 ? '' : 's'}</Badge>
              </Link>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="border-ink-200 bg-white text-ink-600">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
              {me.user.role === 'ADMIN' ? 'Admin' : 'User'}
            </Badge>
            <div className="hidden items-center gap-2 border-l border-ink-200 pl-3 sm:flex">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-ink-900 text-[11px] font-bold text-white">
                {initials(me.user.name ?? me.user.email)}
              </span>
              <div className="max-w-[160px] leading-tight">
                <p className="truncate text-xs font-semibold text-ink-800">{me.user.name ?? 'User'}</p>
                <p className="truncate text-[10px] text-ink-400">{me.user.email}</p>
              </div>
            </div>
            <LogoutButton />
          </div>
        </header>
        <main className="pb-20 lg:pb-8">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
