import Link from 'next/link';
import { ArrowRight, Briefcase, CalendarClock, CheckCircle2, Inbox, MessageSquare, Send, UserRound } from 'lucide-react';
import { safeApi } from '@/lib/api';
import type { ApprovalRequest } from '@/lib/types';
import { formatDateTime, titleCase } from '@/lib/format';
import { statusTone } from '@/lib/format';
import { Badge, Card, CardHeader, EmptyState, PageHeader, PageShell, StatCard } from '@/components/ui';

export const metadata = { title: 'Approvals' };

const CATEGORIES = [
  {
    type: 'APPLICATION_SUBMISSION',
    href: '/approvals/applications',
    label: 'Applications',
    description: 'Tailored resume, cover letter, and answers ready for submission.',
    icon: Briefcase,
  },
  {
    type: 'LINKEDIN_MESSAGE',
    href: '/approvals/linkedin',
    label: 'LinkedIn messages',
    description: 'Prepared outreach that needs a human send.',
    icon: MessageSquare,
  },
  {
    type: 'REFERRAL_REQUEST',
    href: '/approvals/linkedin?filter=referrals',
    label: 'Referral requests',
    description: 'Personalized asks to verified contacts.',
    icon: UserRound,
  },
  {
    type: 'FOLLOWUP',
    href: '/approvals/linkedin?filter=followups',
    label: 'Follow-ups',
    description: 'Scheduled nudges after applications or conversations.',
    icon: Send,
  },
  {
    type: 'HUMAN_ACTION',
    href: '/approvals/applications?filter=human',
    label: 'Human actions',
    description: 'CAPTCHAs, logins, or form fields the worker refused to guess.',
    icon: CalendarClock,
  },
];

export default async function ApprovalsPage() {
  const data = await safeApi<{ approvals: ApprovalRequest[]; counts: Array<{ type: string; status: string; count: number }> }>(
    '/api/approvals?status=PENDING&limit=100',
  );
  const approvals = data?.approvals ?? [];
  const counts = new Map<string, number>();
  for (const row of data?.counts ?? []) {
    if (row.status === 'PENDING') counts.set(row.type, (counts.get(row.type) ?? 0) + row.count);
  }
  const total = approvals.length;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Human in the loop"
        title="Approval queue"
        description="Nothing external leaves this system without an explicit decision. Review content, edit it, or reject it."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {CATEGORIES.map((category) => (
          <StatCard
            key={category.type}
            label={category.label}
            value={counts.get(category.type) ?? 0}
            hint={category.description}
            href={category.href}
            accent={category.type === 'HUMAN_ACTION' ? 'amber' : category.type === 'APPLICATION_SUBMISSION' ? 'green' : undefined}
          />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Next up"
            description="Ordered by priority, then age. Open the category inbox to act."
            action={<Badge tone={statusTone('PENDING')}>{total} pending</Badge>}
          />
          {approvals.length ? (
            <div className="divide-y divide-ink-100">
              {approvals.slice(0, 10).map((approval) => (
                <div key={approval.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-500">
                    <Inbox className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge>{titleCase(approval.type)}</Badge>
                      {approval.priority >= 90 ? (
                        <Badge tone="border-rose-200 bg-rose-50 text-rose-700">High priority</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-ink-900">{approval.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-ink-500">{approval.content}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] text-ink-400">{formatDateTime(approval.createdAt)}</p>
                    <Link
                      href={
                        approval.type === 'APPLICATION_SUBMISSION' || approval.type === 'HUMAN_ACTION'
                          ? '/approvals/applications'
                          : '/approvals/linkedin'
                      }
                      className="link mt-1 inline-flex items-center gap-1 text-[11px]"
                    >
                      Review <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<CheckCircle2 className="h-8 w-8" />}
              title="Approval inbox is clear"
              description="Prepare an application or draft an outreach message to create a new approval."
            />
          )}
        </Card>

        <Card>
          <CardHeader title="How approvals work" />
          <div className="space-y-3 px-5 py-4 text-xs leading-relaxed text-ink-600">
            <p>
              <strong className="text-ink-900">1. Prepare.</strong> The agent generates documents and messages from
              evidence in your profile and the job posting.
            </p>
            <p>
              <strong className="text-ink-900">2. Decide.</strong> Edit, regenerate, postpone, or reject. Edits are saved
              to the underlying message.
            </p>
            <p>
              <strong className="text-ink-900">3. Execute.</strong> In dry-run mode the browser action is simulated. In
              live mode the worker fills forms; CAPTCHAs and unknown fields stop for a human.
            </p>
            <p className="rounded-lg border border-ink-200 bg-ink-50 p-2.5 text-[11px] text-ink-500">
              Bulk approval is limited to outreach and follow-ups. Application submissions always require individual
              review.
            </p>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
