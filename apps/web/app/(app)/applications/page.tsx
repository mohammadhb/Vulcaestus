import Link from 'next/link';
import { ClipboardList, Search } from 'lucide-react';
import { safeApi } from '@/lib/api';
import type { Application } from '@/lib/types';
import { formatDate, scoreTone, statusTone, titleCase } from '@/lib/format';
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  PageShell,
  buttonClass,
} from '@/components/ui';

export const metadata = { title: 'Applications' };

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['q', 'status', 'page']) {
    const value = params[key];
    if (typeof value === 'string' && value) query.set(key, value);
  }
  query.set('pageSize', '25');
  const data = await safeApi<{ applications: Application[]; total: number; page: number; pageSize: number }>(
    `/api/applications?${query.toString()}`,
  );
  const applications = data?.applications ?? [];
  const total = data?.total ?? 0;
  const page = data?.page ?? 1;
  const pageSize = data?.pageSize ?? 25;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  function href(target: number): string {
    const next = new URLSearchParams(query);
    next.set('page', String(target));
    return `/applications?${next.toString()}`;
  }

  const statuses = [
    'READY_FOR_APPROVAL',
    'APPROVED',
    'APPLYING',
    'SUBMITTED',
    'RECRUITER_SCREEN',
    'INTERVIEW',
    'FINAL_ROUND',
    'OFFER',
    'REJECTED',
    'ARCHIVED',
  ];

  return (
    <PageShell>
      <PageHeader
        eyebrow="Pipeline"
        title="Applications"
        description="Track every prepared and submitted application, including answers that still need your input."
      />

      <Card className="mb-5">
        <form className="grid gap-3 p-4 sm:grid-cols-[1fr_220px_auto]" action="/applications" method="get">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
            <input
              name="q"
              defaultValue={typeof params.q === 'string' ? params.q : ''}
              className="input pl-9"
              placeholder="Search role or company"
            />
          </label>
          <select name="status" defaultValue={typeof params.status === 'string' ? params.status : ''} className="input">
            <option value="">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {titleCase(status)}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass('primary')}>
              Filter
            </button>
            <Link href="/applications" className={buttonClass('ghost')}>
              Reset
            </Link>
          </div>
        </form>
      </Card>

      {applications.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="h-8 w-8" />}
            title="No applications yet"
            description="Open a job and choose “Prepare application”. The agent drafts the documents and answers for your review."
            action={
              <Link href="/jobs" className={buttonClass('primary')}>
                Browse jobs
              </Link>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_90px_150px_100px] gap-3 border-b border-ink-100 bg-ink-50/60 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500 md:grid">
            <span>Role</span>
            <span>Company</span>
            <span>Score</span>
            <span>Status</span>
            <span>Updated</span>
          </div>
          <div className="divide-y divide-ink-100">
            {applications.map((application) => (
              <Link key={application.id} href={`/applications/${application.id}`} className="block px-5 py-3.5 transition hover:bg-ink-50/60">
                <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_90px_150px_100px] md:items-center md:gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-900">{application.job?.title ?? 'Application'}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-400">
                      <span>{application.job?.source ?? 'manual'}</span>
                      {application.humanReviewCount ? (
                        <Badge tone="border-rose-200 bg-rose-50 text-rose-700">
                          {application.humanReviewCount} answer(s) to review
                        </Badge>
                      ) : null}
                      {application.submittedAt ? <span>Submitted {formatDate(application.submittedAt)}</span> : null}
                    </div>
                  </div>
                  <div className="min-w-0 text-xs">
                    <p className="truncate font-medium text-ink-700">{application.job?.company ?? '—'}</p>
                    <p className="truncate text-[11px] text-ink-400">{application.job?.location ?? 'Location not stated'}</p>
                  </div>
                  <div>
                    {application.scoreAtApply !== null ? (
                      <Badge tone={scoreTone(application.scoreAtApply)}>{application.scoreAtApply}</Badge>
                    ) : (
                      <span className="text-[11px] text-ink-400">—</span>
                    )}
                  </div>
                  <div>
                    <Badge tone={statusTone(application.status)}>{titleCase(application.status)}</Badge>
                  </div>
                  <div className="text-[11px] text-ink-400">{formatDate(application.lastActivityAt)}</div>
                </div>
              </Link>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-ink-100 px-5 py-3 text-xs text-ink-500">
            <span>
              Page {page} of {pages} · {total} total
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link href={href(page - 1)} className={buttonClass('secondary', 'sm')}>
                  Previous
                </Link>
              ) : null}
              {page < pages ? (
                <Link href={href(page + 1)} className={buttonClass('secondary', 'sm')}>
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        </Card>
      )}
    </PageShell>
  );
}
