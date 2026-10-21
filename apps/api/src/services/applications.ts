import { prisma, type Application, type CandidateProfile, type Job } from '@vulcaestus/db';
import { HttpError } from '../lib/http.js';
import { notify } from '../lib/notify.js';
import { getOrCreateApproval } from './approval-store.js';
import { generateApplicationAnswers, saveApplicationAnswers } from './answers.js';
import { scoreJobForProfile } from './jobs/score.js';
import { generateCoverLetter, generateTailoredResume } from './tailoring.js';

export interface PrepareOptions {
  force?: boolean;
  includeCoverLetter?: boolean;
  includeTailoredResume?: boolean;
  questions?: string[];
}

export async function prepareApplication(
  profile: CandidateProfile,
  job: Job,
  options: PrepareOptions = {},
): Promise<{ application: Application; warnings: string[] }> {
  const existing = await prisma.application.findUnique({
    where: { jobId_profileId: { jobId: job.id, profileId: profile.id } },
  });
  if (
    existing &&
    !options.force &&
    ['SUBMITTED', 'RECRUITER_SCREEN', 'INTERVIEW', 'FINAL_ROUND', 'OFFER', 'APPROVED', 'APPLYING'].includes(
      existing.status,
    )
  ) {
    return { application: existing, warnings: ['Application is already prepared or submitted.'] };
  }

  const resume = await prisma.resume.findFirst({
    where: { profileId: profile.id, isMaster: true, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
  });
  if (!resume) throw new HttpError(400, 'Upload a master resume before preparing an application');

  const latestScore =
    (await prisma.jobScore.findFirst({
      where: { jobId: job.id, profileId: profile.id },
      orderBy: { createdAt: 'desc' },
    })) ?? (await scoreJobForProfile(profile, job, resume));

  const warnings: string[] = [];
  const shouldTailor =
    options.includeTailoredResume ?? latestScore.overallScore >= profile.tailorThreshold;
  const tailored = shouldTailor ? await generateTailoredResume(profile, resume, job) : null;
  if (!shouldTailor) warnings.push('Score is below the tailoring threshold; master resume will be used.');

  let cover = null;
  const needsCover = options.includeCoverLetter ?? profile.coverLettersRequired;
  if (needsCover) {
    const generated = await generateCoverLetter(profile, resume, job, {
      strongMatches: latestScore.strongMatches,
      missingRequirements: latestScore.missingRequirements,
    });
    cover = await prisma.coverLetter.create({
      data: {
        jobId: job.id,
        profileId: profile.id,
        content: generated.content,
        model: generated.model,
        promptVersion: generated.promptVersion,
      },
    });
  }

  const application = await prisma.application.upsert({
    where: { jobId_profileId: { jobId: job.id, profileId: profile.id } },
    update: {
      status: 'READY_FOR_APPROVAL',
      scoreAtApply: latestScore.overallScore,
      tailoredResumeId: tailored?.id ?? null,
      coverLetterId: cover?.id ?? null,
      applicationUrl: job.url,
      lastActivityAt: new Date(),
    },
    create: {
      jobId: job.id,
      profileId: profile.id,
      status: 'READY_FOR_APPROVAL',
      scoreAtApply: latestScore.overallScore,
      tailoredResumeId: tailored?.id ?? null,
      coverLetterId: cover?.id ?? null,
      applicationUrl: job.url,
    },
  });

  const answers = await generateApplicationAnswers(profile, resume, job, options.questions);
  await saveApplicationAnswers(application.id, answers);
  const humanReview = answers.filter((answer) => answer.status === 'HUMAN_REVIEW');
  if (humanReview.length > 0) {
    warnings.push(`${humanReview.length} application answer(s) require human review.`);
  }

  const approval = await getOrCreateApproval({
    profileId: profile.id,
    type: 'APPLICATION_SUBMISSION',
    entityType: 'application',
    entityId: application.id,
    title: `Application: ${job.title} at ${job.company}`,
    content: [
      `Application for ${job.title} at ${job.company}`,
      `Match score: ${latestScore.overallScore}/100 (${latestScore.recommendation})`,
      job.location ? `Location: ${job.location}` : '',
      job.salaryMin || job.salaryMax
        ? `Salary: ${job.salaryMin?.toLocaleString() ?? '?'} – ${job.salaryMax?.toLocaleString() ?? '?'} ${job.currency ?? ''}`
        : 'Salary: not posted',
      latestScore.missingRequirements.length > 0
        ? `Missing requirements: ${latestScore.missingRequirements.join(', ')}`
        : 'Missing requirements: none identified',
      latestScore.risks.length > 0 ? `Risks: ${latestScore.risks.join(' ')}` : '',
      humanReview.length > 0
        ? `Human review required for: ${humanReview.map((answer) => answer.question).join('; ')}`
        : 'All generated answers are evidence-backed.',
      `Application URL: ${job.url ?? 'not provided'}`,
    ]
      .filter(Boolean)
      .join('\n'),
    metadata: {
      applicationId: application.id,
      jobId: job.id,
      company: job.company,
      role: job.title,
      score: latestScore.overallScore,
      recommendation: latestScore.recommendation,
      missingRequirements: latestScore.missingRequirements,
      risks: latestScore.risks,
      tailoredResumeId: tailored?.id,
      coverLetterId: cover?.id,
      humanReviewQuestions: humanReview.map((answer) => answer.question),
      applicationUrl: job.url,
      dryRun: profile.automationMode !== 'AUTONOMOUS_MODE',
    },
    priority: latestScore.overallScore >= 90 ? 95 : 80,
    expiresInHours: 24 * 21,
  });

  await notify({
    subject: `Application ready: ${job.title} at ${job.company}`,
    body: `Score ${latestScore.overallScore}/100. Review and approve the application in the dashboard.${
      humanReview.length > 0 ? ` ${humanReview.length} answer(s) need your input.` : ''
    }`,
    metadata: { applicationId: application.id, approvalId: approval.id },
  });

  return { application, warnings };
}
