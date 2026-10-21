import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { safeApi } from '@/lib/api';
import type { ApprovalRequest } from '@/lib/types';
import { Badge, PageHeader, PageShell, buttonClass, cn } from '@/components/ui';
import { ApprovalInbox } from '@/components/approval-inbox';

export const metadata = { title: 'Application approvals' };

const FILTERS = [
  { key: 'all', label: 'All application actions' },
  { key: 'applications', label: 'Applications' },
  { key: 'human', label: 'Human actions' },
];

export default async function ApplicationApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = 'all' } = await searchParams;
  const data = await safeApi<{ approvals: ApprovalRequest[] }>('/api/approvals?status=PENDING&limit=100');
  let approvals = data?.approvals ?? [];

  if (filter === 'applications') approvals = approvals.filter((approval) => approval.type === 'APPLICATION_SUBMISSION');
  else if (filter === 'human') approvals = approvals.filter((approval) => approval.type === 'HUMAN_ACTION');
  else
    approvals = approvals.filter((approval) =>
      ['APPLICATION_SUBMISSION', 'HUMAN_ACTION', 'INTERVIEW_ACTION'].includes(approval.type),
    );

  const applicationApprovals = approvals.filter((approval) => approval.type === 'APPLICATION_SUBMISSION');
  const humanApprovals = approvals.filter((approval) => approval.type !== 'APPLICATION_SUBMISSION');

  return (
    <PageShell>
      <PageHeader
        eyebrow="Application approvals"
        title="Submit with confidence"
        description="Review the role, score, documents, missing requirements, and answers before anything is submitted."
        actions={
          <Badge tone="border-accent-200 bg-accent-50 text-accent-800">
            <ShieldCheck className="h-3 w-3" /> Individual approval required
          </Badge>
        }
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={`/approvals/applications${item.key === 'all' ? '' : `?filter=${item.key}`}`}
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

      {applicationApprovals.length > 0 ? (
        <div className="mb-6 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Applications ({applicationApprovals.length})</h2>
          <ApprovalInbox approvals={applicationApprovals} mode="application" />
        </div>
      ) : null}

      {humanApprovals.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Human actions ({humanApprovals.length})</h2>
          <ApprovalInbox approvals={humanApprovals} mode="human" />
        </div>
      ) : null}

      {approvals.length === 0 ? (
        <ApprovalInbox approvals={[]} mode="application" />
      ) : null}

      <div className="mt-6 rounded-lg border border-ink-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-ink-500">
        <strong className="text-ink-700">What happens on approve?</strong> In dry run, the browser action is simulated and
        recorded — nothing is sent. In live mode, the worker opens the application URL, fills only mapped fields, and
        submits only when the approval gate passes. CAPTCHAs, login walls, and unknown required fields pause the action
        and create a new human-action approval.
      </div>
    </PageShell>
  );
}
