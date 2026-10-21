import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { safeApi } from '@/lib/api';
import type { ApprovalRequest } from '@/lib/types';
import { PageHeader, PageShell, buttonClass, cn } from '@/components/ui';
import { ApprovalInbox } from '@/components/approval-inbox';

export const metadata = { title: 'LinkedIn approvals' };

const FILTERS = [
  { key: 'all', label: 'All outreach' },
  { key: 'messages', label: 'Connection & messages' },
  { key: 'referrals', label: 'Referral requests' },
  { key: 'followups', label: 'Follow-ups' },
  { key: 'high', label: 'High priority' },
];

export default async function LinkedInApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = 'all' } = await searchParams;
  const data = await safeApi<{ approvals: ApprovalRequest[] }>('/api/approvals?status=PENDING&limit=100');
  let approvals = data?.approvals ?? [];

  if (filter === 'messages') approvals = approvals.filter((approval) => approval.type === 'LINKEDIN_MESSAGE');
  else if (filter === 'referrals') approvals = approvals.filter((approval) => approval.type === 'REFERRAL_REQUEST');
  else if (filter === 'followups') approvals = approvals.filter((approval) => approval.type === 'FOLLOWUP');
  else if (filter === 'high') approvals = approvals.filter((approval) => approval.priority >= 80);
  else
    approvals = approvals.filter((approval) =>
      ['LINKEDIN_MESSAGE', 'REFERRAL_REQUEST', 'FOLLOWUP'].includes(approval.type),
    );

  const mode = filter === 'followups' ? 'followup' : 'linkedin';

  return (
    <PageShell>
      <PageHeader
        eyebrow="Outreach approvals"
        title="Message inbox"
        description="Approve prepares the message in a persistent browser profile. You press Send — the worker never does."
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={`/approvals/linkedin${item.key === 'all' ? '' : `?filter=${item.key}`}`}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
              filter === item.key
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50',
            )}
          >
            {item.label}
          </Link>
        ))}
        <Link href="/approvals" className={buttonClass('ghost', 'sm', 'ml-auto')}>
          Approval overview
        </Link>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-[11px] leading-relaxed text-ink-500">
        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
        <span>
          Messages are generated only from your profile and the contacts you supplied. Unverified relationships are
          labeled. Live sends require clicking Send yourself; confirm the send from the approval queue afterward.
        </span>
      </div>

      <ApprovalInbox approvals={approvals} mode={mode} />
    </PageShell>
  );
}
