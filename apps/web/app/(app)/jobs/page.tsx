import { safeApi } from '@/lib/api';
import type { Job } from '@/lib/types';
import { PageHeader, PageShell } from '@/components/ui';
import { DiscoverButton } from '@/components/discover-button';
import { ImportJobForm } from '@/components/import-job-form';
import { JobsWorkspace, type JobCounts } from '@/components/jobs-workspace';

export const metadata = { title: 'Jobs' };

interface JobsResponse {
  jobs: Job[];
  total: number;
  page: number;
  pageSize: number;
  counts: JobCounts;
  facets?: { sources: string[] };
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawParams)) {
    if (typeof value === 'string' && value) params[key] = value;
  }

  const query = new URLSearchParams(params);
  query.set('pageSize', '25');
  const [data] = await Promise.all([
    safeApi<JobsResponse>(`/api/jobs?${query.toString()}`),
  ]);

  const jobs = data?.jobs ?? [];
  const total = data?.total ?? 0;
  const counts = data?.counts ?? { active: 0, archived: 0, deleted: 0, unscored: 0 };
  const page = data?.page ?? 1;
  const pageSize = data?.pageSize ?? 25;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Discovery"
        title="Jobs"
        description={`${counts.active} active job${counts.active === 1 ? '' : 's'} in your private catalog. Scores, archives, and applications never affect another user.`}
        actions={
          <>
            <ImportJobForm />
            <DiscoverButton />
          </>
        }
      />

      <JobsWorkspace
        jobs={jobs}
        total={total}
        page={page}
        pageSize={pageSize}
        counts={counts}
        params={params}
        sources={data?.facets?.sources ?? []}
      />
    </PageShell>
  );
}
