import { prisma, type CandidateProfile, type FollowUp } from '@vulcaestus/db';
import { env } from '../env.js';
import { runAiText, runAiJson } from './ai.js';
import { getOrCreateApproval } from './approval-store.js';
import { notify } from '../lib/notify.js';
import { checkLimit } from '../lib/limits.js';

export async function runFollowUps(
  profile: CandidateProfile,
  options: { days?: number; limit?: number } = {},
): Promise<{ created: number; skipped: number }> {
  const days = options.days ?? env.FOLLOWUP_DAYS;
  const limit = options.limit ?? env.MAX_FOLLOWUPS_PER_DAY;
  const limitStatus = await checkLimit(profile.id, 'followupsSent', limit);
  if (!limitStatus.allowed) return { created: 0, skipped: 0 };

  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
  const applications = await prisma.application.findMany({
    where: {
      profileId: profile.id,
      deletedAt: null,
      status: { in: ['SUBMITTED', 'RECRUITER_SCREEN'] },
      submittedAt: { lte: cutoff },
    },
    include: { job: true },
    take: limit * 2,
  });

  let created = 0;
  let skipped = 0;
  for (const application of applications) {
    if (created >= limit) break;
    const existing = await prisma.followUp.findFirst({
      where: {
        profileId: profile.id,
        applicationId: application.id,
        status: { in: ['SCHEDULED', 'DUE', 'AWAITING_APPROVAL'] },
      },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    const previous = await prisma.followUp.findFirst({
      where: { profileId: profile.id, applicationId: application.id },
      orderBy: { createdAt: 'desc' },
    });

    const fallback = `Hello,\n\nI wanted to follow up on my application for the ${application.job.title} role at ${application.job.company}, submitted on ${
      application.submittedAt?.toISOString().slice(0, 10) ?? 'the date above'
    }. I remain interested and would be happy to provide any additional information.\n\nBest regards,\n${profile.fullName}`;
    const ai = await runAiText({
      kind: 'FOLLOW_UP',
      promptName: 'follow-up',
      entityType: 'application',
      entityId: application.id,
      inputRefs: { profileId: profile.id, applicationId: application.id, attempt: (previous?.attempts ?? 0) + 1 },
      variables: {
        type: previous ? 'second_followup' : 'first_followup',
        candidate: { fullName: profile.fullName, headline: profile.headline, technologies: profile.technologies },
        job: { title: application.job.title, company: application.job.company },
        recipient: 'Hiring team',
        context: {
          submittedAt: application.submittedAt,
          daysSinceSubmission: days,
          previousFollowUp: previous?.sentAt ?? null,
        },
      },
    });

    const followUp = await prisma.followUp.create({
      data: {
        profileId: profile.id,
        applicationId: application.id,
        jobId: application.jobId,
        type: previous ? 'SECOND_FOLLOW_UP' : 'APPLICATION_FOLLOW_UP',
        dueAt: new Date(),
        status: 'AWAITING_APPROVAL',
        message: ai?.text ?? fallback,
        attempts: (previous?.attempts ?? 0) + 1,
      },
    });

    await getOrCreateApproval({
      profileId: profile.id,
      type: 'FOLLOWUP',
      entityType: 'followup',
      entityId: followUp.id,
      title: `Follow up: ${application.job.title} at ${application.job.company}`,
      content: ai?.text ?? fallback,
      metadata: {
        followUpId: followUp.id,
        applicationId: application.id,
        jobId: application.jobId,
        daysSinceSubmission: days,
        attempt: followUp.attempts,
      },
      priority: 55,
      expiresInHours: 24 * 7,
    });
    created += 1;
  }

  if (created > 0) {
    await notify({
      subject: `${created} follow-up(s) ready for approval`,
      body: 'Review the generated follow-ups in the approval queue. Nothing is sent without approval.',
      metadata: { profileId: profile.id },
    });
  }
  return { created, skipped };
}

export async function scheduleFollowUp(input: {
  profileId: string;
  applicationId?: string;
  outreachId?: string;
  jobId?: string;
  type: string;
  dueAt: Date;
  message?: string;
}): Promise<FollowUp> {
  const followUp = await prisma.followUp.create({
    data: {
      profileId: input.profileId,
      applicationId: input.applicationId,
      outreachId: input.outreachId,
      jobId: input.jobId,
      type: input.type,
      dueAt: input.dueAt,
      message: input.message,
      status: 'SCHEDULED',
    },
  });
  return followUp;
}

export async function listDueFollowUps(profileId: string): Promise<FollowUp[]> {
  return prisma.followUp.findMany({
    where: {
      profileId,
      status: { in: ['SCHEDULED', 'DUE'] },
      dueAt: { lte: new Date() },
    },
    include: { application: { include: { job: true } }, outreach: { include: { contact: true } } },
    orderBy: { dueAt: 'asc' },
  });
}

export { runAiJson };
