import Link from 'next/link';
import {
  ArrowRight,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  FileText,
  Inbox,
  Send,
  Sparkles,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { api, safeApi } from '@/lib/api';
import type { AnalyticsSummary, ApprovalRequest, Job, Me } from '@/lib/types';
import { formatDateTime, scoreTone, statusTone, titleCase, truncate } from '@/lib/format';
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  PageShell,
  Progress,
  StatCard,
} from '@/components/ui';
import { DiscoverButton } from '@/components/discover-button';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const [me, summary, approvals, recent] = await Promise.all([
    api<Me>('/api/auth/me'),
    safeApi<AnalyticsSummary>('/api/analytics/summary'),
    safeApi<{ approvals: ApprovalRequest[] }>('/api/approvals?status=PENDING&limit=6'),
    safeApi<{ jobs: Job[] }>('/api/jobs?pageSize=6'),
  ]);

  const cards = summary?.cards;
  const onboarding = !me.profile || me.profile.targetTitles.length === 0;
  const pipeline = summary?.pipeline ?? {};
  const pipelineEntries = Object.entries(pipeline).sort((a, b) => b[1] - a[1]);
  const pipelineTotal = pipelineEntries.reduce((sum, [, count]) => sum + count, 0) || 1;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Overview"
        title={`Good to see you${me.user.name ? `, ${me.user.name.split(' ')[0]}` : ''}`}
        description="Your pipeline at a glance. The agent prepares; you decide what leaves the building."
        actions={
          <>
            <ButtonLink href="/jobs" variant="secondary">
              <Briefcase className="h-4 w-4" /> Browse jobs
            </ButtonLink>
            <DiscoverButton />
          </>
        }
      />

      {onboarding ? (
        <Card className="mb-6 overflow-hidden border-accent-200 bg-gradient-to-br from-accent-50 via-white to-white">
          <CardBody className="flex flex-wrap items-center justify-between gap-5 py-5">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-600 text-white">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-ink-900">Finish setting up your candidate profile</h2>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-ink-600">
                  Add target titles, locations, salary expectations, and skills. Then upload a master resume.
                  Scoring and tailoring stay grounded in that evidence.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <ButtonLink href="/profile">
                <UserRound className="h-4 w-4" /> Complete profile
              </ButtonLink>
              <ButtonLink href="/resume" variant="secondary">
                <FileText className="h-4 w-4" /> Upload resume
              </ButtonLink>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Jobs found today" value={cards?.jobsFoundToday ?? 0} hint="Across enabled sources" href="/jobs" accent="blue" />
        <StatCard label="Strong matches" value={cards?.strongMatches ?? 0} hint="Score 90+ (latest scores)" href="/jobs?minScore=90" accent="green" />
        <StatCard
          label="Pending approvals"
          value={(cards?.messagesPending ?? 0) + (cards?.applicationsPending ?? 0)}
          hint={`${cards?.humanActionsRequired ?? 0} human action(s) required`}
          href="/approvals"
          accent="amber"
        />
        <StatCard label="Submitted" value={cards?.applicationsSubmitted ?? 0} hint={`${summary?.periods.submittedThisWeek ?? 0} this week`} href="/applications" />
        <StatCard label="Interviews" value={cards?.interviews ?? 0} hint={`${summary?.rates.interviewRate ?? 0}% interview rate`} href="/interviews" accent="violet" />
        <StatCard label="Offers" value={cards?.offers ?? 0} hint={`${summary?.rates.offerRate ?? 0}% offer rate`} href="/applications?status=OFFER" accent="green" />
        <StatCard label="Response rate" value={`${summary?.rates.responseRate ?? 0}%`} hint="Of submitted applications" href="/analytics" />
        <StatCard
          label="Average match score"
          value={summary?.rates.averageJobScore ?? '—'}
          hint={`${summary?.scores.total ?? 0} scored job(s)`}
          href="/analytics"
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Approval queue"
            description="Prepared actions waiting for your decision."
            action={
              <Link href="/approvals" className="link text-xs">
                Open inbox <ArrowRight className="inline h-3 w-3" />
              </Link>
            }
          />
          {approvals?.approvals.length ? (
            <div className="divide-y divide-ink-100">
              {approvals.approvals.map((approval) => {
                const meta = approval.metadata ?? {};
                const person = typeof meta.contactName === 'string' ? meta.contactName : null;
                return (
                  <Link
                    key={approval.id}
                    href={
                      approval.type === 'APPLICATION_SUBMISSION'
                        ? `/approvals/applications`
                        : `/approvals/linkedin`
                    }
                    className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-ink-50/70"
                  >
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-600">
                      {approval.type === 'APPLICATION_SUBMISSION' ? (
                        <Briefcase className="h-4 w-4" />
                      ) : approval.type === 'FOLLOWUP' ? (
                        <Send className="h-4 w-4" />
                      ) : (
                        <Inbox className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={statusTone('PENDING')}>{titleCase(approval.type)}</Badge>
                        {approval.priority >= 90 ? (
                          <Badge tone="border-rose-200 bg-rose-50 text-rose-700">High priority</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-ink-900">{approval.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-ink-500">{truncate(approval.content, 140)}</p>
                      {person ? <p className="mt-1 text-[11px] text-ink-400">Contact: {person}</p> : null}
                    </div>
                    <span className="shrink-0 text-[11px] text-ink-400">{formatDateTime(approval.createdAt)}</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<CheckCircle2 className="h-8 w-8" />}
              title="Inbox zero"
              description="No pending approvals. Generate an application or an outreach message to create one."
              action={
                <ButtonLink href="/jobs" variant="secondary" size="sm">
                  Find jobs
                </ButtonLink>
              }
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Pipeline" description="All applications by stage." action={<Link href="/applications" className="link text-xs">View</Link>} />
          <CardBody className="space-y-3">
            {pipelineEntries.length > 0 ? (
              pipelineEntries.slice(0, 7).map(([status, count]) => (
                <div key={status}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-ink-700">{titleCase(status)}</span>
                    <span className="text-ink-400">{count}</span>
                  </div>
                  <Progress value={(count / pipelineTotal) * 100} />
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-xs text-ink-400">No applications yet.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Recently discovered jobs"
            description="Latest jobs in your private catalog, with your latest score."
            action={
              <Link href="/jobs" className="link text-xs">
                All jobs <ArrowRight className="inline h-3 w-3" />
              </Link>
            }
          />
          {recent?.jobs.length ? (
            <div className="divide-y divide-ink-100">
              {recent.jobs.map((job) => {
                const score = job.scores?.[0];
                return (
                  <Link key={job.id} href={`/jobs/${job.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-ink-50/70">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-900">{job.title}</p>
                      <p className="mt-0.5 truncate text-xs text-ink-500">
                        {job.company}
                        {job.location ? ` · ${job.location}` : ''}
                        {job.remoteType !== 'UNKNOWN' ? ` · ${titleCase(job.remoteType)}` : ''}
                      </p>
                    </div>
                    {score ? (
                      <Badge tone={scoreTone(score.overallScore)}>{score.overallScore}</Badge>
                    ) : (
                      <span className="text-[11px] text-ink-400">Not scored</span>
                    )}
                    <span className="hidden w-20 text-right text-[11px] text-ink-400 sm:block">{job.source}</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Briefcase className="h-8 w-8" />}
              title="No jobs yet"
              description="Configure a job source in Settings, then run discovery. Manual imports also work."
              action={
                <ButtonLink href="/settings" size="sm">
                  Configure sources
                </ButtonLink>
              }
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Upcoming interviews" action={<Link href="/interviews" className="link text-xs">Open</Link>} />
          {summary?.upcomingInterviews.length ? (
            <div className="divide-y divide-ink-100">
              {summary.upcomingInterviews.map((interview) => (
                <Link key={interview.id} href={`/interviews?focus=${interview.id}`} className="block px-5 py-3 transition hover:bg-ink-50/70">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5 text-violet-500" />
                    <p className="truncate text-xs font-semibold text-ink-900">{interview.company}</p>
                    <Badge tone={statusTone('INTERVIEW')}>{interview.stage}</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-ink-500">{interview.title}</p>
                  <p className="mt-1 text-[11px] text-ink-400">{formatDateTime(interview.scheduledAt)}</p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<CalendarDays className="h-8 w-8" />}
              title="No interviews scheduled"
              description="Log an interview from an application to generate a preparation brief."
            />
          )}
          <div className="border-t border-ink-100 px-5 py-3">
            <div className="flex items-center justify-between text-[11px] text-ink-500">
              <span>Today's activity</span>
              <TrendingUp className="h-3.5 w-3.5 text-accent-600" />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-sm font-bold text-ink-900">{summary?.today.jobsDiscovered ?? 0}</p>
                <p className="text-[10px] text-ink-400">jobs</p>
              </div>
              <div>
                <p className="text-sm font-bold text-ink-900">{summary?.today.applicationsSubmitted ?? 0}</p>
                <p className="text-[10px] text-ink-400">submitted</p>
              </div>
              <div>
                <p className="text-sm font-bold text-ink-900">{summary?.today.messagesSent ?? 0}</p>
                <p className="text-[10px] text-ink-400">messages</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
