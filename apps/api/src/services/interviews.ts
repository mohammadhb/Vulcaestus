import { prisma, type CandidateProfile, type Interview, type Resume } from '@vulcaestus/db';
import {
  interviewBriefingSchema,
  type InterviewBriefing,
  type StructuredResume,
} from '@vulcaestus/types';
import { HttpError } from '../lib/http.js';
import { notify } from '../lib/notify.js';
import { runAiJson } from './ai.js';

export async function createInterview(input: {
  profile: CandidateProfile;
  applicationId: string;
  stage: string;
  scheduledAt: Date;
  interviewer?: string;
  location?: string;
  notes?: string;
}): Promise<Interview> {
  const application = await prisma.application.findFirst({
    where: { id: input.applicationId, profileId: input.profile.id },
    include: { job: true },
  });
  if (!application) throw new HttpError(404, 'Application not found');

  const interview = await prisma.interview.create({
    data: {
      profileId: input.profile.id,
      applicationId: application.id,
      jobId: application.jobId,
      stage: input.stage,
      scheduledAt: input.scheduledAt,
      interviewer: input.interviewer,
      location: input.location,
      notes: input.notes,
    },
  });
  await prisma.application.update({
    where: { id: application.id },
    data: { status: 'INTERVIEW', lastActivityAt: new Date() },
  });
  await notify({
    subject: `Interview scheduled: ${application.job.title} at ${application.job.company}`,
    body: `${input.stage} on ${input.scheduledAt.toISOString()}. Generate a preparation brief from the Interviews page.`,
    metadata: { interviewId: interview.id, applicationId: application.id },
  });
  return interview;
}

function fallbackBriefing(
  profile: CandidateProfile,
  resume: Resume | null,
  interview: Interview,
  job: { title: string; company: string; location: string | null; requiredSkills: string[]; description: string },
): InterviewBriefing {
  const structured = (resume?.structured ?? null) as StructuredResume | null;
  const achievements = (structured?.experience ?? [])
    .flatMap((experience) =>
      experience.achievements.map((achievement) => ({
        description: achievement.description,
        company: experience.company,
        role: experience.role,
        metrics: achievement.metrics,
      })),
    )
    .slice(0, 3);

  return {
    companyBriefing: `No external company research was supplied. Based only on the job posting: ${job.description.slice(0, 900)}`,
    roleBriefing: `${job.title} at ${job.company}${job.location ? ` (${job.location})` : ''}. Key technologies in the posting: ${
      job.requiredSkills.join(', ') || 'not listed'
    }. Interview stage: ${interview.stage}.`,
    likelyQuestions: [
      `Walk me through your experience relevant to ${job.title}.`,
      ...job.requiredSkills.slice(0, 4).map((skill) => `How have you used ${skill} in production?`),
      'Tell me about a difficult technical trade-off you made.',
      'Describe a time you disagreed with a teammate and how you resolved it.',
    ],
    starExamples: achievements.map((achievement) => ({
      question: `Tell me about a time you ${achievement.description.slice(0, 80)}...`,
      situation: `At ${achievement.company || 'a previous employer'} as ${achievement.role || 'an engineer'}.`,
      task: 'Deliver the outcome described in the resume achievement.',
      action: achievement.description,
      result: achievement.metrics.join('; ') || 'Outcome as described in the master resume.',
      sourceAchievement: `${achievement.company}: ${achievement.description}`,
    })),
    technicalPreparation: job.requiredSkills.map((skill) => `Review a concrete example of using ${skill}.`),
    questionsToAsk: [
      'How does the team measure success for this role in the first six months?',
      'What is the biggest technical constraint the team is working around?',
      'How are technical decisions made and reviewed?',
    ],
    warnings: ['No external company research was performed. Verify company facts before the interview.'],
  };
}

export async function prepareInterviewBriefing(
  profile: CandidateProfile,
  interviewId: string,
): Promise<{ interview: Interview; briefing: InterviewBriefing }> {
  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, profileId: profile.id },
    include: { job: true },
  });
  if (!interview) throw new HttpError(404, 'Interview not found');
  const resume = await prisma.resume.findFirst({
    where: { profileId: profile.id, isMaster: true, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
  });
  const structured = (resume?.structured ?? null) as StructuredResume | null;
  const achievements =
    structured?.experience.flatMap((experience) =>
      experience.achievements.map((achievement) => ({
        company: experience.company,
        role: experience.role,
        description: achievement.description,
        metrics: achievement.metrics,
      })),
    ) ?? [];

  const ai = await runAiJson({
    kind: 'INTERVIEW_PREPARATION',
    promptName: 'interview-preparation',
    entityType: 'interview',
    entityId: interview.id,
    inputRefs: { profileId: profile.id, interviewId: interview.id, jobId: interview.jobId },
    schema: interviewBriefingSchema,
    variables: {
      candidate: {
        fullName: profile.fullName,
        summary: profile.summary,
        technologies: profile.technologies,
        targetTitles: profile.targetTitles,
        yearsExperience: profile.yearsExperience,
      },
      achievements,
      job: {
        title: interview.job.title,
        company: interview.job.company,
        location: interview.job.location,
        requiredSkills: interview.job.requiredSkills,
        description: interview.job.description.slice(0, 8000),
      },
      stage: interview.stage,
      scheduledAt: interview.scheduledAt.toISOString(),
      interviewer: interview.interviewer ?? 'not provided',
    },
  });

  const briefing = interviewBriefingSchema.parse(
    ai?.data ?? fallbackBriefing(profile, resume, interview, interview.job),
  );
  const updated = await prisma.interview.update({
    where: { id: interview.id },
    data: { briefing: briefing as unknown as object },
  });
  return { interview: updated, briefing };
}
