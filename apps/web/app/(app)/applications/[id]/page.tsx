import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  MessageSquare,
  Monitor,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { api, safeApi } from '@/lib/api';
import type {
  Application,
  ApplicationAnswer,
  ApprovalRequest,
  BrowserAction,
  CoverLetter,
  FollowUp,
  Interview,
  Job,
  JobScore,
  TailoredResume,
} from '@/lib/types';
import { formatDate, formatDateTime, salaryLabel, scoreTone, statusTone, titleCase } from '@/lib/format';
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  KeyValue,
  Notice,
  PageHeader,
  PageShell,
} from '@/components/ui';
import { ApprovalCard } from '@/components/approval-card';
import { AnswersEditor } from '@/components/answers-editor';
import { ApplicationStatusControl } from '@/components/application-status-control';
import { AddInterviewForm } from '@/components/add-interview-form';
import { RequestApprovalButton } from '@/components/request-approval-button';

export const metadata = { title: 'Application' };

interface Detail {
  application: Application & {
    job: Job & { scores: JobScore[] };
    answers: ApplicationAnswer[];
    followUps: FollowUp[];
    interviews: Interview[];
    browserActions: BrowserAction[];
  };
  approvals: ApprovalRequest[];
  tailoredResume: TailoredResume | null;
  coverLetter: CoverLetter | null;
}

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data: Detail;
  try {
    data = await api(`/api/applications/${id}`);
  } catch {
    notFound();
  }
  const { application, approvals, tailoredResume, coverLetter } = data;
  const job = application.job;
  const score = job.scores?.[0];
  const pending = approvals.filter((approval) => approval.status === 'PENDING');
  const humanReview = application.answers.filter((answer) => answer.status === 'HUMAN_REVIEW');
  const timeline = await safeApi<{ timeline: Array<{ id: string; action: string; createdAt: string; metadata: Record<string, unknown> }> }>(
    `/api/applications/${id}/timeline`,
  );

  return (
    <PageShell>
      <Link href="/applications" className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to applications
      </Link>

      <PageHeader
        eyebrow={job.company}
        title={job.title}
        description={`Application created ${formatDate(application.createdAt)} · Last activity ${formatDateTime(application.lastActivityAt)}`}
        actions={
          <>
            <ButtonLink href={`/jobs/${job.id}`} variant="secondary">
              View job
            </ButtonLink>
            {job.url ? (
              <ButtonLink href={job.url}>
                Open posting <ExternalLink className="h-4 w-4" />
              </ButtonLink>
            ) : null}
            {pending.length === 0 && !['SUBMITTED', 'APPLYING'].includes(application.status) ? (
              <RequestApprovalButton applicationId={application.id} />
            ) : null}
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Status</p>
          <div className="mt-2">
            <Badge tone={statusTone(application.status)} className="text-xs">
              {titleCase(application.status)}
            </Badge>
          </div>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Match score</p>
          <div className="mt-2">
            {application.scoreAtApply !== null ? (
              <Badge tone={scoreTone(application.scoreAtApply)} className="text-xs">
                {application.scoreAtApply}/100
              </Badge>
            ) : (
              <span className="text-xs text-ink-400">Not scored</span>
            )}
          </div>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Answers</p>
          <p className="mt-2 text-sm font-bold text-ink-900">
            {application.answers.length}{' '}
            <span className="text-xs font-normal text-ink-500">prepared</span>
          </p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Needs your input</p>
          <p className={`mt-2 text-sm font-bold ${humanReview.length ? 'text-rose-700' : 'text-accent-700'}`}>
            {humanReview.length || 'None'}
          </p>
        </div>
      </div>

      {humanReview.length > 0 ? (
        <div className="mb-5">
          <Notice tone="warning">
            {humanReview.length} answer(s) could not be answered confidently or are sensitive. Review them below before
            approving submission. The browser worker will not submit if required fields remain empty.
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {pending.length > 0 ? (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Pending approval</h2>
              {pending.map((approval) => (
                <ApprovalCard key={approval.id} approval={approval} mode="application" />
              ))}
            </div>
          ) : null}

          <Card>
            <CardHeader
              title="Documents"
              description="Generated from your master resume. Download, review, or regenerate from the job page."
            />
            <CardBody className="space-y-4">
              {tailoredResume ? (
                <div className="rounded-lg border border-ink-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-ink-500" />
                      <span className="text-xs font-semibold text-ink-800">Tailored resume</span>
                      <Badge tone={statusTone(tailoredResume.status)}>{titleCase(tailoredResume.status)}</Badge>
                    </div>
                    <div className="flex gap-1.5">
                      {(['pdf', 'docx', 'md'] as const).map((format) => (
                        <a
                          key={format}
                          href={`/api/documents/tailored/${tailoredResume.id}?format=${format}`}
                          className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50"
                        >
                          <Download className="h-3 w-3" /> {format.toUpperCase()}
                        </a>
                      ))}
                    </div>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[11px] font-medium text-ink-500">Preview markdown</summary>
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-ink-50 p-3 text-[11px] leading-relaxed text-ink-700">
                      {tailoredResume.contentMarkdown}
                    </pre>
                  </details>
                </div>
              ) : (
                <p className="text-xs text-ink-400">No tailored resume was attached to this application.</p>
              )}

              {coverLetter ? (
                <div className="rounded-lg border border-ink-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-ink-800">Cover letter</span>
                    <div className="flex gap-1.5">
                      {(['pdf', 'docx', 'md'] as const).map((format) => (
                        <a
                          key={format}
                          href={`/api/documents/cover-letter/${coverLetter.id}?format=${format}`}
                          className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50"
                        >
                          <Download className="h-3 w-3" /> {format.toUpperCase()}
                        </a>
                      ))}
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-ink-600">{coverLetter.content}</p>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Application answers"
              description="Every answer carries a source. Unknown or sensitive questions stay in human review."
            />
            <CardBody>
              <AnswersEditor applicationId={application.id} answers={application.answers} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Browser actions" description="Every attempt is logged. Screenshots are captured for review." />
            {application.browserActions.length ? (
              <div className="divide-y divide-ink-100">
                {application.browserActions.map((action) => (
                  <div key={action.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Monitor className="h-3.5 w-3.5 text-ink-400" />
                      <span className="font-semibold text-ink-800">{titleCase(action.kind)}</span>
                      <Badge tone={statusTone(action.status)}>{titleCase(action.status)}</Badge>
                      {action.dryRun ? <Badge tone="border-indigo-200 bg-indigo-50 text-indigo-700">Dry run</Badge> : null}
                      <span className="text-ink-400">{formatDateTime(action.createdAt)}</span>
                    </div>
                    {action.error ? <p className="mt-1 text-[11px] text-rose-700">{action.error}</p> : null}
                    {action.screenshots.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {action.screenshots.map((screenshot, index) => (
                          <a
                            key={screenshot}
                            href={`/api/browser-actions/${action.id}/screenshot/${index}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md border border-ink-200 px-2 py-1 text-[11px] text-ink-600 hover:bg-ink-50"
                          >
                            Screenshot {index + 1}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Monitor className="h-7 w-7" />}
                title="No browser activity yet"
                description="Approving the application queues a browser action. Dry-run actions are simulated and never submit."
              />
            )}
          </Card>

          <Card>
            <CardHeader
              title="Interviews"
              action={<AddInterviewForm applicationId={application.id} />}
            />
            {application.interviews.length ? (
              <div className="divide-y divide-ink-100">
                {application.interviews.map((interview) => (
                  <Link key={interview.id} href={`/interviews?focus=${interview.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50/60">
                    <CalendarDays className="h-4 w-4 text-violet-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-ink-800">{interview.stage}</p>
                      <p className="text-[11px] text-ink-500">
                        {formatDateTime(interview.scheduledAt)}
                        {interview.interviewer ? ` · ${interview.interviewer}` : ''}
                      </p>
                    </div>
                    {Object.keys(interview.briefing ?? {}).length ? (
                      <Badge tone="border-violet-200 bg-violet-50 text-violet-700">Brief ready</Badge>
                    ) : (
                      <Badge>No brief</Badge>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<CalendarDays className="h-7 w-7" />}
                title="No interviews logged"
                description="Add an interview to generate a preparation brief from your real experience."
              />
            )}
          </Card>

          <Card>
            <CardHeader title="Follow-ups" action={<Link href="/approvals/linkedin?filter=followups" className="link text-xs">Approval queue</Link>} />
            {application.followUps.length ? (
              <div className="divide-y divide-ink-100">
                {application.followUps.map((followUp) => (
                  <div key={followUp.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Send className="h-3.5 w-3.5 text-ink-400" />
                      <span className="font-semibold text-ink-800">{titleCase(followUp.type)}</span>
                      <Badge tone={statusTone(followUp.status)}>{titleCase(followUp.status)}</Badge>
                      <span className="text-ink-400">Due {formatDate(followUp.dueAt)}</span>
                    </div>
                    {followUp.message ? (
                      <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-ink-600">{followUp.message}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Send className="h-7 w-7" />}
                title="No follow-ups yet"
                description="Follow-ups are generated after the configured delay and always require approval."
              />
            )}
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Update application" />
            <CardBody>
              <ApplicationStatusControl
                applicationId={application.id}
                status={application.status}
                notes={application.notes}
                applicationUrl={application.applicationUrl}
                submittedAt={application.submittedAt}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Job snapshot" />
            <CardBody>
              <dl>
                <KeyValue label="Company">{job.company}</KeyValue>
                <KeyValue label="Location">{job.location ?? 'Not stated'}</KeyValue>
                <KeyValue label="Work mode">{titleCase(job.remoteType)}</KeyValue>
                <KeyValue label="Salary">{salaryLabel(job.salaryMin, job.salaryMax, job.currency)}</KeyValue>
                <KeyValue label="Source">{job.source}</KeyValue>
                {score ? <KeyValue label="Current score">{score.overallScore}/100</KeyValue> : null}
              </dl>
            </CardBody>
          </Card>

          {score?.risks.length ? (
            <Card>
              <CardHeader title="Risks to verify" />
              <CardBody>
                <ul className="space-y-2 text-xs leading-relaxed text-ink-600">
                  {score.risks.map((risk) => (
                    <li key={risk} className="flex gap-2">
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      {risk}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {application.confirmationRef ? (
            <Card>
              <CardHeader title="Submission confirmation" />
              <CardBody>
                <p className="flex items-start gap-2 text-xs text-ink-600">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
                  <span>{application.confirmationRef}</span>
                </p>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Activity" />
            <CardBody>
              {timeline?.timeline.length ? (
                <ol className="space-y-2.5">
                  {timeline.timeline.slice(0, 10).map((entry) => (
                    <li key={entry.id} className="flex gap-2 text-[11px]">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-300" />
                      <div>
                        <p className="font-medium text-ink-700">{titleCase(entry.action)}</p>
                        <p className="text-ink-400">{formatDateTime(entry.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-ink-400">No activity recorded.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Guardrails" />
            <CardBody className="space-y-2 text-[11px] leading-relaxed text-ink-500">
              <p className="flex gap-2">
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Submission only proceeds after approval.
              </p>
              <p className="flex gap-2">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> CAPTCHAs and unknown fields stop the worker.
              </p>
              <p className="flex gap-2">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Generated claims are traceable to your master profile.
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>
    </PageShell>
  );
}
