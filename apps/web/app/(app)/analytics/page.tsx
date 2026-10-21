import { Activity, BarChart3, Clock, Inbox, Send } from 'lucide-react';
import { safeApi } from '@/lib/api';
import type { AnalyticsSummary } from '@/lib/types';
import { formatDateTime, titleCase } from '@/lib/format';
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  PageShell,
  Progress,
  StatCard,
} from '@/components/ui';

export const metadata = { title: 'Analytics' };

interface ActivityEntry {
  id: string;
  action: string;
  createdAt: string;
  result: string;
}

export default async function AnalyticsPage() {
  const [summary, activity] = await Promise.all([
    safeApi<AnalyticsSummary>('/api/analytics/summary'),
    safeApi<{ activity: ActivityEntry[] }>('/api/analytics/activity?limit=30'),
  ]);
  const rates = summary?.rates;
  const daily = summary?.daily ?? [];
  const maxDaily = Math.max(1, ...daily.map((day) => day.applicationsSubmitted + day.jobsDiscovered));

  return (
    <PageShell>
      <PageHeader
        eyebrow="Insight"
        title="Analytics"
        description="Outcome metrics for your own profile and private job catalog."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Response rate" value={`${rates?.responseRate ?? 0}%`} hint="Advanced or rejected after applying" accent="green" />
        <StatCard label="Interview rate" value={`${rates?.interviewRate ?? 0}%`} hint="Of all submitted applications" accent="violet" />
        <StatCard label="Offer rate" value={`${rates?.offerRate ?? 0}%`} hint="Of all submitted applications" accent="green" />
        <StatCard label="Referral conversion" value={`${rates?.referralConversion ?? 0}%`} hint="Sent referral asks → advanced" />
        <StatCard label="Average match score" value={rates?.averageJobScore ?? '—'} hint={`${summary?.scores.total ?? 0} scored jobs`} />
        <StatCard label="Avg. response time" value={rates?.averageResponseDays !== null && rates?.averageResponseDays !== undefined ? `${rates.averageResponseDays}d` : '—'} hint="From submission to status change" />
        <StatCard label="Applications this week" value={summary?.periods.applicationsThisWeek ?? 0} hint={`${summary?.periods.applicationsThisMonth ?? 0} this month`} />
        <StatCard label="Submitted this month" value={summary?.periods.submittedThisMonth ?? 0} hint={`${summary?.periods.submittedThisWeek ?? 0} this week`} accent="blue" />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Activity over the last 14 days" description="Jobs discovered vs. applications submitted." />
          <CardBody>
            {daily.length > 0 ? (
              <div className="flex h-48 items-end gap-1.5">
                {daily.map((day) => {
                  const total = day.jobsDiscovered + day.applicationsSubmitted;
                  return (
                    <div key={day.date} className="group flex flex-1 flex-col items-center justify-end gap-1">
                      <div className="flex w-full items-end justify-center gap-0.5" style={{ height: `${Math.max(4, (total / maxDaily) * 160)}px` }}>
                        <div
                          className="w-1/2 rounded-t bg-sky-300 transition group-hover:bg-sky-400"
                          style={{ height: `${Math.max(2, (day.jobsDiscovered / maxDaily) * 160)}px` }}
                          title={`${day.jobsDiscovered} jobs discovered`}
                        />
                        <div
                          className="w-1/2 rounded-t bg-accent-500 transition group-hover:bg-accent-600"
                          style={{ height: `${Math.max(2, (day.applicationsSubmitted / maxDaily) * 160)}px` }}
                          title={`${day.applicationsSubmitted} applications submitted`}
                        />
                      </div>
                      <span className="text-[9px] text-ink-400">{day.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={<BarChart3 className="h-7 w-7" />} title="No activity yet" description="Discovery and application activity will appear here." />
            )}
            <div className="mt-4 flex gap-4 text-[10px] text-ink-500">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-sky-300" /> Jobs discovered</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-accent-500" /> Applications submitted</span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Score distribution" description="Latest score per job." />
          <CardBody className="space-y-3">
            {summary?.scores.distribution ? (
              Object.entries(summary.scores.distribution).map(([key, count]) => {
                const total = Math.max(1, summary.scores.total);
                return (
                  <div key={key}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-ink-700">{titleCase(key)}</span>
                      <span className="text-ink-400">{count}</span>
                    </div>
                    <Progress
                      value={(count / total) * 100}
                      tone={key === 'strongApply' ? 'accent' : key === 'reject' ? 'rose' : key === 'review' ? 'amber' : 'sky'}
                    />
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-ink-400">No scored jobs.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {[
          { title: 'Applications by source', data: summary?.bySource ?? [], icon: <Send className="h-3.5 w-3.5" /> },
          { title: 'Applications by company', data: summary?.byCompany ?? [], icon: <BarChart3 className="h-3.5 w-3.5" /> },
          { title: 'Applications by role', data: summary?.byRole ?? [], icon: <Clock className="h-3.5 w-3.5" /> },
        ].map((section) => (
          <Card key={section.title}>
            <CardHeader title={section.title} />
            <CardBody className="space-y-2">
              {section.data.length ? (
                section.data.map((entry) => {
                  const max = Math.max(1, ...section.data.map((item) => item.count));
                  return (
                    <div key={entry.label}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-ink-600">{entry.label}</span>
                        <span className="text-ink-400">{entry.count}</span>
                      </div>
                      <Progress value={(entry.count / max) * 100} />
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-ink-400">No data yet.</p>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      <Card className="mt-5">
        <CardHeader title="Pipeline snapshot" description="Current stage of every application." />
        <CardBody>
          {summary?.pipeline && Object.keys(summary.pipeline).length ? (
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {Object.entries(summary.pipeline).map(([status, count]) => (
                <div key={status} className="rounded-lg border border-ink-200 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">{titleCase(status)}</p>
                  <p className="mt-1 text-xl font-bold text-ink-900">{count}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-400">No applications yet.</p>
          )}
        </CardBody>
      </Card>

      <Card className="mt-5">
        <CardHeader title="Audit activity" description="Every important action is recorded." action={<Activity className="h-4 w-4 text-ink-400" />} />
        {activity?.activity.length ? (
          <div className="divide-y divide-ink-100">
            {activity.activity.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${entry.result === 'success' ? 'bg-accent-500' : 'bg-rose-500'}`} />
                  <span className="truncate text-xs font-medium text-ink-700">{titleCase(entry.action)}</span>
                </div>
                <span className="shrink-0 text-[10px] text-ink-400">{formatDateTime(entry.createdAt)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Inbox className="h-7 w-7" />} title="No audit entries" />
        )}
      </Card>
    </PageShell>
  );
}
