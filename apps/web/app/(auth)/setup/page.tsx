import { redirect } from 'next/navigation';
import { publicApi } from '@/lib/api';
import { SetupForm } from '@/components/setup-form';
import { Notice } from '@/components/ui';

export const metadata = { title: 'Set up' };
export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const status = await publicApi<{ needsSetup: boolean }>('/api/auth/status').catch(() => null);
  if (status && !status.needsSetup) redirect('/login');
  return (
    <div className="animate-in">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-700">First run</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink-900">Create your admin account</h1>
      <p className="mb-5 mt-1 text-sm text-ink-500">
        This account owns the workspace. You can invite additional users later from Settings.
      </p>
      <div className="mb-5">
        <Notice tone="info">
          The system starts in <strong>SAFE_MODE</strong> with <strong>dry run</strong> enabled. Nothing is
          submitted or sent until you change configuration and approve an action.
        </Notice>
      </div>
      <SetupForm />
    </div>
  );
}
