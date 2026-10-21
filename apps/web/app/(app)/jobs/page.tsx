import Link from 'next/link';
import { Briefcase, Filter, Search } from 'lucide-react';
import { safeApi } from '@/lib/api';
import type { Job } from '@/lib/types';
import { scoreTone, titleCase, formatDate, salaryLabel } from '@/lib/format';
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  PageShell,
  buttonClass,
} from '@/components/ui';
import { DiscoverButton } from '@/components/discover-button';
import { ImportJobForm } from '@/components/import-job-form';

export const metadata = { title: 'Jobs' };

interface JobsResponse {
  jobs: Job[];
  total: number;
  page: number;
  pageSize: number;
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['q', 'minScore', 'recommendation', 'source', 'remoteType', 'hasApplication', 'page']) {
    const value = params[key];
    if (typeof value === 'string' && value) query.set(key, value);
  }
  query.set('pageSize', '25');
  const data = await safeApi<JobsResponse>(`/api/jobs?${query.toString()}`);
  const jobs = data?.jobs ?? [];
  const total = data?.total ?? 0;
  const page = data?.page ?? 1;
  const pageSize = data?.pageSize ?? 25;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  function pageHref(target: number): string {
    const next = new URLSearchParams(query);
    next.set('page', String(target));
    return `/jobs?${next.toString()}`;
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Discovery"
        title="Jobs"
        description={`${total} job${total === 1 ? '' : 's'} in the shared catalog. Scores and applications are scoped to your profile.`}
        actions={
          <>
            <ImportJobForm />
            <DiscoverButton />
          </>
        }
      />

      <Card className="mb-5">
        <form className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-6" action="/jobs" method="get">
          <label className="relative xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
            <input
              name="q"
              defaultValue={typeof params.q === 'string' ? params.q : ''}
              className="input pl-9"
              placeholder="Search title, company, description"
            />
          </label>
          <select name="remoteType" defaultValue={typeof params.remoteType === 'string' ? params.remoteType : ''} className="input">
            <option value="">Any work mode</option>
            {['REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN'].map((mode) => (
              <option key={mode} value={mode}>
                {titleCase(mode)}
              </option>
            ))}
          </select>
          <select name="recommendation" defaultValue={typeof params.recommendation === 'string' ? params.recommendation : ''} className="input">
            <option value="">Any recommendation</option>
            {['STRONG_APPLY', 'APPLY', 'REVIEW', 'LOW_PRIORITY', 'REJECT'].map((value) => (
              <option key={value} value={value}>
                {titleCase(value)}
              </option>
            ))}
          </select>
          <select name="minScore" defaultValue={typeof params.minScore === 'string' ? params.minScore : ''} className="input">
            <option value="">Any score</option>
            <option value="90">90+</option>
            <option value="80">80+</option>
            <option value="70">70+</option>
            <option value="60">60+</option>
          </select>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass('primary', 'md', 'flex-1')}>
              <Filter className="h-4 w-4" /> Filter
            </button>
            <Link href="/jobs" className={buttonClass('ghost', 'md')}>
              Reset
            </Link>
          </div>
        </form>
      </Card>

      {jobs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Briefcase className="h-8 w-8" />}
            title="No jobs match"
            description="Try clearing filters, importing a posting manually, or running discovery from a configured source."
            action={<DiscoverButton />}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_90px_120px_110px] gap-3 border-b border-ink-100 bg-ink-50/60 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500 md:grid">
            <span>Role</span>
            <span>Company / location</span>
            <span>Score</span>
            <span>Recommendation</span>
            <span>Status</span>
          </div>
          <div className="divide-y divide-ink-100">
            {jobs.map((job) => {
              const score = job.scores?.[0];
              const application = job.applications?.[0];
              return (
                <Link key={job.id} href={`/jobs/${job.id}`} className="block px-5 py-3.5 transition hover:bg-ink-50/60">
                  <div className="grid gap-2 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_90px_120px_110px] md:items-center md:gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-900">{job.title}</p>
                      <p className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-ink-400">
                        <span className="rounded bg-ink-100 px-1.5 py-0.5">{job.source}</span>
                        <span>{formatDate(job.discoveredAt)}</span>
                        {job.salaryMin || job.salaryMax ? (
                          <span>{salaryLabel(job.salaryMin, job.salaryMax, job.currency)}</span>
                        ) : null}
                      </p>
                    </div>
                    <div className="min-w-0 text-xs">
                      <p className="truncate font-medium text-ink-700">{job.company}</p>
                      <p className="truncate text-[11px] text-ink-400">
                        {job.location ?? 'Location not stated'} · {titleCase(job.remoteType)}
                      </p>
                    </div>
                    <div>
                      {score ? (
                        <Badge tone={scoreTone(score.overallScore)}>{score.overallScore}/100</Badge>
                      ) : (
                        <span className="text-[11px] text-ink-400">Unscored</span>
                      )}
                    </div>
                    <div>
                      {score ? (
                        <span className="text-xs font-medium text-ink-700">{titleCase(score.recommendation)}</span>
                      ) : (
                        <span className="text-[11px] text-ink-400">—</span>
                      )}
                    </div>
                    <div>
                      {application ? (
                        <Badge tone={scoreTone(score?.overallScore ?? null)}>{titleCase(application.status)}</Badge>
                      ) : (
                        <span className="text-[11px] text-ink-400">No application</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-ink-100 px-5 py-3 text-xs text-ink-500">
            <span>
              Page {page} of {pages} · {total} total
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className={buttonClass('secondary', 'sm')}>
                  Previous
                </Link>
              ) : null}
              {page < pages ? (
                <Link href={pageHref(page + 1)} className={buttonClass('secondary', 'sm')}>
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
