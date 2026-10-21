import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  ArrowUpRight,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  MapPin,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { api, safeApi } from '@/lib/api';
import type { Application, ApprovalRequest, Job, Resume } from '@/lib/types';
import { formatDate, formatDateTime, salaryLabel, scoreTone, statusTone, titleCase, truncate } from '@/lib/format';
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
  Progress,
} from '@/components/ui';
import { JobActions } from '@/components/job-actions';
import { JobManageActions } from '@/components/job-manage-actions';
import { ContactForm } from '@/components/contact-form';
import { OutreachTrigger } from '@/components/outreach-trigger';
import { RankReferralsButton } from '@/components/rank-referrals-button';

export const metadata = { title: 'Job' };

const SUBSCORES: Array<[string, keyof NonNullable<Job['scores']>[number]]> = [
  ['Technical', 'technicalScore'],
  ['Experience', 'experienceScore'],
  ['Seniority', 'seniorityScore'],
  ['Location', 'locationScore'],
  ['Salary', 'salaryScore'],
  ['Authorization', 'authorizationScore'],
  ['Industry', 'industryScore'],
  ['Preference', 'preferenceScore'],
];

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data: { job: Job; application: Application | null; approvals: ApprovalRequest[] };
  try {
    data = await api(`/api/jobs/${id}`);
  } catch {
    notFound();
  }
  const { job, application, approvals } = data;
  const score = job.scores?.[0];
  const resumes = await safeApi<{ resumes: Resume[] }>('/api/resumes');
  const hasResume = Boolean(resumes?.resumes.some((resume) => resume.isMaster));
  const pendingApproval = approvals.find((approval) => approval.status === 'PENDING');

  return (
    <PageShell>
      <Link href="/jobs" className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to jobs
      </Link>

      {job.archivedAt ? (
        <div className="mb-4">
          <Notice tone="warning">
            This job is archived. It is hidden from the active list but keeps its scores, documents, and application
            history.
          </Notice>
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="border-ink-200 bg-white text-ink-600">{job.source}</Badge>
            {job.remoteType !== 'UNKNOWN' ? <Badge>{titleCase(job.remoteType)}</Badge> : null}
            {job.seniority !== 'UNKNOWN' ? <Badge>{titleCase(job.seniority)}</Badge> : null}
            {job.visaSponsorship === false ? <Badge tone={statusTone('REJECTED')}>No sponsorship indicated</Badge> : null}
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-ink-900">{job.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-600">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-ink-400" /> {job.company}
            </span>
            {job.location ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-ink-400" /> {job.location}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-ink-400" /> Discovered {formatDate(job.discoveredAt)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <JobManageActions jobId={job.id} archived={Boolean(job.archivedAt)} deleted={false} />
          {job.url ? (
            <ButtonLink href={job.url} variant="secondary">
              <ExternalLink className="h-4 w-4" /> Original posting
            </ButtonLink>
          ) : null}
          {application ? (
            <ButtonLink href={`/applications/${application.id}`}>
              Open application <ArrowUpRight className="h-4 w-4" />
            </ButtonLink>
          ) : null}
        </div>
      </div>

      <Card className="mb-5">
        <CardBody className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Prepare with evidence</p>
            <JobActions jobId={job.id} applicationId={application?.id} hasResume={hasResume} />
          </div>
          {pendingApproval ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-semibold">Waiting for your approval</p>
              <Link href="/approvals/applications" className="mt-1 inline-block underline">
                Review application approval →
              </Link>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader
              title="Match assessment"
              description={score ? `${score.model} · prompt ${score.promptVersion}` : 'No score yet for your profile.'}
              action={
                score ? (
                  <div className="flex items-center gap-2">
                    <Badge tone={scoreTone(score.overallScore)} className="text-xs">
                      {score.overallScore}/100
                    </Badge>
                    <Badge tone={statusTone(score.recommendation)}>{titleCase(score.recommendation)}</Badge>
                  </div>
                ) : null
              }
            />
            {score ? (
              <CardBody>
                <p className="text-sm leading-relaxed text-ink-700">{score.reasoning}</p>
                <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {SUBSCORES.map(([label, key]) => (
                    <div key={label}>
                      <div className="mb-1 flex items-center justify-between text-[11px]">
                        <span className="font-medium text-ink-600">{label}</span>
                        <span className="text-ink-400">{String(score[key])}</span>
                      </div>
                      <Progress value={Number(score[key])} tone={Number(score[key]) < 50 ? 'rose' : Number(score[key]) < 70 ? 'amber' : 'accent'} />
                    </div>
                  ))}
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent-700">Strong matches</p>
                    <div className="flex flex-wrap gap-1.5">
                      {score.strongMatches.length ? (
                        score.strongMatches.map((skill) => (
                          <Badge key={skill} tone="border-accent-200 bg-accent-50 text-accent-800">
                            {skill}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-ink-400">None identified</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-700">Missing requirements</p>
                    <div className="flex flex-wrap gap-1.5">
                      {score.missingRequirements.length ? (
                        score.missingRequirements.map((skill) => (
                          <Badge key={skill} tone="border-rose-200 bg-rose-50 text-rose-700">
                            {skill}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-ink-400">None identified</span>
                      )}
                    </div>
                  </div>
                </div>
                {score.risks.length ? (
                  <div className="mt-4">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                      <ShieldAlert className="h-3.5 w-3.5" /> Risks
                    </p>
                    <ul className="list-disc space-y-1 pl-4 text-xs text-ink-600">
                      {score.risks.map((risk) => (
                        <li key={risk}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardBody>
            ) : (
              <EmptyState
                icon={<Sparkles className="h-8 w-8" />}
                title="Not scored yet"
                description="Run scoring to see evidence-backed subscores and a recommendation."
              />
            )}
          </Card>

          <Card>
            <CardHeader title="Job description" description="Original posting content, stored locally." />
            <CardBody>
              <div className="max-h-[520px] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
                {job.description}
              </div>
            </CardBody>
          </Card>

          {job.requirements.length || job.responsibilities.length ? (
            <Card>
              <CardHeader title="Extracted requirements" />
              <CardBody className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Requirements</p>
                  <ul className="space-y-1.5 text-xs leading-relaxed text-ink-600">
                    {job.requirements.slice(0, 20).map((item) => (
                      <li key={item} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-300" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Responsibilities</p>
                  <ul className="space-y-1.5 text-xs leading-relaxed text-ink-600">
                    {job.responsibilities.slice(0, 20).map((item) => (
                      <li key={item} className="flex gap-2">
                        <Briefcase className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-300" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Tailored documents"
              description="Generated only from your master resume. Blocked additions are listed in the change notes."
            />
            <CardBody className="space-y-4">
              {job.tailoredResumes?.length ? (
                job.tailoredResumes.map((tailored) => {
                  const diff = tailored.diff as { changeNotes?: string[]; warnings?: string[] };
                  return (
                    <div key={tailored.id} className="rounded-lg border border-ink-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-ink-500" />
                          <span className="text-xs font-semibold text-ink-800">
                            Tailored resume · {formatDateTime(tailored.createdAt)}
                          </span>
                          <Badge tone={statusTone(tailored.status)}>{titleCase(tailored.status)}</Badge>
                        </div>
                        <div className="flex gap-1.5">
                          {(['pdf', 'docx', 'md'] as const).map((format) => (
                            <a
                              key={format}
                              href={`/api/documents/tailored/${tailored.id}?format=${format}`}
                              className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50"
                            >
                              <Download className="h-3 w-3" /> {format.toUpperCase()}
                            </a>
                          ))}
                        </div>
                      </div>
                      {diff.changeNotes?.length ? (
                        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[11px] text-ink-500">
                          {diff.changeNotes.slice(0, 8).map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-ink-400">No tailored resume yet. Use “Tailor resume” above.</p>
              )}

              {job.coverLetters?.length ? (
                <div className="space-y-3 border-t border-ink-100 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Cover letters</p>
                  {job.coverLetters.map((cover) => (
                    <details key={cover.id} className="rounded-lg border border-ink-200 p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-ink-800">
                        Cover letter · {formatDateTime(cover.createdAt)} · {cover.model}
                      </summary>
                      <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-ink-600">{cover.content}</p>
                      <div className="mt-3 flex gap-1.5">
                        {(['pdf', 'docx', 'md'] as const).map((format) => (
                          <a
                            key={format}
                            href={`/api/documents/cover-letter/${cover.id}?format=${format}`}
                            className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50"
                          >
                            <Download className="h-3 w-3" /> {format.toUpperCase()}
                          </a>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Referral contacts"
              description="Contacts you supplied. The system never scrapes LinkedIn or invents relationships."
              action={<RankReferralsButton jobId={job.id} />}
            />
            <CardBody className="space-y-4">
              {job.contacts?.length ? (
                job.contacts.map((contact) => (
                  <div key={contact.id} className="rounded-lg border border-ink-200 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-ink-900">{contact.name}</p>
                        <p className="text-xs text-ink-500">
                          {contact.title ?? 'Title unknown'} · {contact.company}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <Badge>{titleCase(contact.category)}</Badge>
                          <Badge tone={contact.verified ? 'border-accent-200 bg-accent-50 text-accent-800' : 'border-amber-200 bg-amber-50 text-amber-800'}>
                            {contact.verified ? 'Relationship verified' : 'Relationship unverified'}
                          </Badge>
                          {contact.linkedinUrl ? (
                            <a href={contact.linkedinUrl} target="_blank" rel="noreferrer" className="link text-[11px]">
                              LinkedIn ↗
                            </a>
                          ) : null}
                        </div>
                      </div>
                      <Badge tone={scoreTone(contact.relevanceScore)}>{contact.relevanceScore}</Badge>
                    </div>
                    {contact.reason ? <p className="mt-2 text-xs text-ink-600">{contact.reason}</p> : null}
                    <div className="mt-3">
                      <OutreachTrigger jobId={job.id} contact={contact} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-ink-200 p-4 text-center">
                  <Users className="mx-auto h-6 w-6 text-ink-300" />
                  <p className="mt-2 text-xs font-medium text-ink-700">No contacts at {job.company}</p>
                  <p className="mx-auto mt-1 max-w-md text-[11px] leading-relaxed text-ink-500">
                    Add people you already know or have verified. For LinkedIn, open the posting/profile yourself and
                    import the URL — automated scraping is intentionally not implemented.
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <ContactForm company={job.company} jobId={job.id} compact />
                <ButtonLink href="/contacts" variant="ghost" size="sm">
                  Manage contacts
                </ButtonLink>
              </div>
            </CardBody>
          </Card>

          {job.outreach?.length ? (
            <Card>
              <CardHeader title="Outreach for this role" action={<Link href="/outreach" className="link text-xs">All outreach</Link>} />
              <div className="divide-y divide-ink-100">
                {job.outreach.map((message) => (
                  <div key={message.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <MessageSquare className="h-3.5 w-3.5 text-ink-400" />
                      <span className="font-semibold text-ink-800">{message.contact?.name ?? 'Contact'}</span>
                      <Badge>{titleCase(message.type)}</Badge>
                      <Badge tone={statusTone(message.status)}>{titleCase(message.status)}</Badge>
                      <span className="text-ink-400">{formatDateTime(message.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-600">{message.body}</p>
                    {message.status === 'PENDING_APPROVAL' ? (
                      <Link href="/approvals/linkedin" className="link mt-1 inline-block text-[11px]">
                        Review in approval inbox →
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Quick facts" />
            <CardBody>
              <dl>
                <KeyValue label="Company">{job.company}</KeyValue>
                <KeyValue label="Location">{job.location ?? 'Not stated'}</KeyValue>
                <KeyValue label="Work mode">{titleCase(job.remoteType)}</KeyValue>
                <KeyValue label="Employment">{titleCase(job.employmentType)}</KeyValue>
                <KeyValue label="Seniority">{titleCase(job.seniority)}</KeyValue>
                <KeyValue label="Salary">{salaryLabel(job.salaryMin, job.salaryMax, job.currency)}</KeyValue>
                <KeyValue label="Experience">
                  {job.yearsExperience ? `${job.yearsExperience}+ years` : 'Not stated'}
                </KeyValue>
                <KeyValue label="Sponsorship">
                  {job.visaSponsorship === true ? 'Indicated' : job.visaSponsorship === false ? 'Not indicated' : 'Unknown'}
                </KeyValue>
                <KeyValue label="Source">{job.source}</KeyValue>
              </dl>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {job.requiredSkills.slice(0, 16).map((skill) => (
                  <Badge key={skill}>{skill}</Badge>
                ))}
              </div>
            </CardBody>
          </Card>

          {application ? (
            <Card>
              <CardHeader title="Application" action={<Badge tone={statusTone(application.status)}>{titleCase(application.status)}</Badge>} />
              <CardBody className="space-y-2 text-xs text-ink-600">
                <p>
                  Score at apply: <strong>{application.scoreAtApply ?? '—'}</strong>
                </p>
                <p>Created {formatDate(application.createdAt)}</p>
                {application.submittedAt ? <p>Submitted {formatDateTime(application.submittedAt)}</p> : null}
                {application.humanReviewCount ? (
                  <Notice tone="warning">{application.humanReviewCount} answer(s) need human review.</Notice>
                ) : null}
                <ButtonLink href={`/applications/${application.id}`} size="sm" className="mt-2 w-full">
                  Open application
                </ButtonLink>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Data provenance" />
            <CardBody className="space-y-2 text-[11px] leading-relaxed text-ink-500">
              <p className="flex gap-2">
                <Globe2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Original description stored locally from {job.source}.
              </p>
              <p className="flex gap-2">
                <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Salary and sponsorship are extracted from the posting
                and may be incomplete.
              </p>
              <p className="flex gap-2">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Generated documents never add unverified skills or
                metrics.
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>
    </PageShell>
  );
}
