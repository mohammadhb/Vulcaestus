import { redirect } from 'next/navigation';
import { publicApi } from '@/lib/api';
import { LoginForm } from '@/components/login-form';

export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const status = await publicApi<{ needsSetup: boolean }>('/api/auth/status').catch(() => null);
  if (status?.needsSetup) redirect('/setup');
  const params = await searchParams;
  return (
    <div className="animate-in">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-700">Welcome back</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink-900">Sign in to your workspace</h1>
      <p className="mb-7 mt-1 text-sm text-ink-500">Your job search data stays on this server.</p>
      <LoginForm next={params.next} />
    </div>
  );
}
