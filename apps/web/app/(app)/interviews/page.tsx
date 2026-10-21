import Link from 'next/link';
import { CalendarDays, MapPin, UserRound } from 'lucide-react';
import { safeApi } from '@/lib/api';
import type { Application, Interview } from '@/lib/types';
import { formatDateTime, statusTone, titleCase } from '@/lib/format';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Notice,
  PageHeader,
  PageShell,
} from '@/components/ui';
import { InterviewCreator } from '@/components/interview-creator';
import { PrepareBriefingButton } from '@/components/prepare-briefing-button';

export const metadata = { title: 'Interviews' };

interface Briefing {
  companyBriefing?: string;
  roleBriefing?: string;
  likelyQuestions?: string[];
  starExamples?: Array<{ question: string; situation: string; task: string; action: string; result: string; sourceAchievement?: string }>;
  technicalPreparation?: string[];
  questionsToAsk?: string[];
  warnings?: string[];
}

export default async function InterviewsPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const { focus } = await searchParams;
  const [data, apps] = await Promise.all([
    safeApi<{ interviews: Interview[] }>('/api/interviews'),
    safeApi<{ applications: Application[] }>('/api/applications?pageSize=100'),
  ]);
  const interviews = [...(data?.interviews ?? [])].sort((a, b) => {
    if (focus) {
      if (a.id === focus) return -1;
      if (b.id === focus) return 1;
    }
    return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
  });
  const applications = (apps?.applications ?? []).map((application) => ({
    id: application.id,
    title: application.job?.title ?? 'Application',
    company: application.job?.company ?? '',
  }));

  return (
    <PageShell>
      <PageHeader
        eyebrow="Preparation"
        title="Interviews"
        description="Briefs are built from the job posting and your actual achievements. Company research is not invented."
        actions={<InterviewCreator applications={applications} />}
      />

      {interviews.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays className="h-8 w-8" />}
            title="No interviews logged"
            description="When an interview is scheduled, log it on the application or here. A brief can then be generated."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {interviews.map((interview) => {
            const briefing = (interview.briefing ?? {}) as Briefing;
            const hasBriefing = Object.keys(briefing).length > 0;
            const upcoming = new Date(interview.scheduledAt).getTime() >= Date.now();
            return (
              <Card key={interview.id} className={focus === interview.id ? 'ring-2 ring-accent-300' : undefined}>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {interview.job?.title ?? 'Interview'}
                      <Badge tone={statusTone(upcoming ? 'INTERVIEW' : 'ARCHIVED')}>{upcoming ? 'Upcoming' : 'Past'}</Badge>
                      <Badge>{interview.stage}</Badge>
                    </span>
                  }
                  description={`${interview.job?.company ?? ''} · ${formatDateTime(interview.scheduledAt)}`}
                  action={<PrepareBriefingButton interviewId={interview.id} hasBriefing={hasBriefing} />}
                />
                <CardBody className="space-y-4">
                  <div className="flex flex-wrap gap-4 text-xs text-ink-500">
                    {interview.interviewer ? (
                      <span className="inline-flex items-center gap-1.5">
                        <UserRound className="h-3.5 w-3.5" /> {interview.interviewer}
                      </span>
                    ) : null}
                    {interview.location ? (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" /> {interview.location}
                      </span>
                    ) : null}
                    {interview.applicationId ? (
                      <Link href={`/applications/${interview.applicationId}`} className="link">
                        Open application
                      </Link>
                    ) : null}
                  </div>

                  {hasBriefing ? (
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-3">
                        <section>
                          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Company</h3>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-600">{briefing.companyBriefing}</p>
                        </section>
                        <section>
                          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Role</h3>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-600">{briefing.roleBriefing}</p>
                        </section>
                        {briefing.likelyQuestions?.length ? (
                          <section>
                            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Likely questions</h3>
                            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-ink-600">
                              {briefing.likelyQuestions.slice(0, 12).map((question) => (
                                <li key={question}>{question}</li>
                              ))}
                            </ul>
                          </section>
                        ) : null}
                        {briefing.technicalPreparation?.length ? (
                          <section>
                            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Technical prep</h3>
                            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-ink-600">
                              {briefing.technicalPreparation.slice(0, 12).map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </section>
                        ) : null}
                      </div>
                      <div className="space-y-3">
                        {briefing.starExamples?.length ? (
                          <section>
                            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">STAR examples from your experience</h3>
                            <div className="mt-1.5 space-y-2">
                              {briefing.starExamples.slice(0, 4).map((example) => (
                                <details key={example.question} className="rounded-lg border border-ink-200 p-2.5">
                                  <summary className="cursor-pointer text-[11px] font-semibold text-ink-800">{example.question}</summary>
                                  <dl className="mt-2 space-y-1 text-[11px] leading-relaxed text-ink-600">
                                    <div><dt className="inline font-semibold text-ink-700">S: </dt><dd className="inline">{example.situation}</dd></div>
                                    <div><dt className="inline font-semibold text-ink-700">T: </dt><dd className="inline">{example.task}</dd></div>
                                    <div><dt className="inline font-semibold text-ink-700">A: </dt><dd className="inline">{example.action}</dd></div>
                                    <div><dt className="inline font-semibold text-ink-700">R: </dt><dd className="inline">{example.result}</dd></div>
                                    {example.sourceAchievement ? (
                                      <p className="mt-1 text-[10px] text-ink-400">Source: {example.sourceAchievement}</p>
                                    ) : null}
                                  </dl>
                                </details>
                              ))}
                            </div>
                          </section>
                        ) : null}
                        {briefing.questionsToAsk?.length ? (
                          <section>
                            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Questions to ask</h3>
                            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-ink-600">
                              {briefing.questionsToAsk.slice(0, 10).map((question) => (
                                <li key={question}>{question}</li>
                              ))}
                            </ul>
                          </section>
                        ) : null}
                        {briefing.warnings?.length ? <Notice tone="warning">{briefing.warnings.join(' ')}</Notice> : null}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-ink-400">
                      No brief yet. Generate one to see likely questions and STAR stories grounded in your resume.
                    </p>
                  )}
                  {interview.notes ? (
                    <div className="rounded-lg border border-ink-100 bg-ink-50/50 p-2.5 text-xs text-ink-600">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Your notes</p>
                      <p className="whitespace-pre-wrap">{interview.notes}</p>
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
