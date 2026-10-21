import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, type Prisma } from '@vulcaestus/db';
import { APPLICATION_STATUSES } from '@vulcaestus/types';
import { requireProfile } from '../auth.js';
import { HttpError, asString, audit, getPagination, jsonValue } from '../lib/http.js';
import { generateApplicationAnswers, saveApplicationAnswers } from '../services/answers.js';
import { getOrCreateApproval } from '../services/approval-store.js';

export async function applicationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/applications', async (request) => {
    const auth = requireProfile(request);
    const query = request.query as Record<string, unknown>;
    const { page, pageSize, skip, take } = getPagination(query);
    const status = asString(query.status);
    const search = asString(query.q);
    const where: Prisma.ApplicationWhereInput = {
      profileId: auth.profile.id,
      deletedAt: null,
      ...(status ? { status: status as 'DISCOVERED' } : {}),
      ...(search
        ? {
            job: {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { company: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const [total, applications] = await Promise.all([
      prisma.application.count({ where }),
      prisma.application.findMany({
        where,
        include: {
          job: true,
          answers: { select: { id: true, status: true, sensitive: true } },
        },
        orderBy: [{ lastActivityAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
    ]);
    return {
      applications: applications.map((application) => ({
        ...application,
        humanReviewCount: application.answers.filter((answer) => answer.status === 'HUMAN_REVIEW').length,
      })),
      total,
      page,
      pageSize,
    };
  });

  app.get('/api/applications/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const application = await prisma.application.findFirst({
      where: { id, profileId: auth.profile.id, deletedAt: null },
      include: {
        job: { include: { scores: { where: { profileId: auth.profile.id }, orderBy: { createdAt: 'desc' }, take: 1 } } },
        answers: { orderBy: { createdAt: 'asc' } },
        followUps: { orderBy: { createdAt: 'desc' } },
        interviews: { orderBy: { scheduledAt: 'asc' } },
        browserActions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!application) throw new HttpError(404, 'Application not found');
    const approvals = await prisma.approvalRequest.findMany({
      where: { profileId: auth.profile.id, entityId: application.id },
      orderBy: { createdAt: 'desc' },
    });
    const [tailoredResume, coverLetter] = await Promise.all([
      application.tailoredResumeId
        ? prisma.tailoredResume.findUnique({ where: { id: application.tailoredResumeId } })
        : null,
      application.coverLetterId
        ? prisma.coverLetter.findUnique({ where: { id: application.coverLetterId } })
        : null,
    ]);
    return { application, approvals, tailoredResume, coverLetter };
  });

  app.patch('/api/applications/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z
      .object({
        status: z.enum(APPLICATION_STATUSES).optional(),
        notes: z.string().max(10000).nullable().optional(),
        applicationUrl: z.string().url().nullable().optional(),
      })
      .parse(request.body);
    const existing = await prisma.application.findFirst({
      where: { id, profileId: auth.profile.id, deletedAt: null },
    });
    if (!existing) throw new HttpError(404, 'Application not found');

    const application = await prisma.application.update({
      where: { id },
      data: {
        status: input.status,
        notes: input.notes,
        applicationUrl: input.applicationUrl,
        lastActivityAt: new Date(),
        ...(input.status === 'SUBMITTED' && !existing.submittedAt ? { submittedAt: new Date() } : {}),
        ...(input.status === 'OFFER' || input.status === 'REJECTED' ? {} : {}),
      },
    });
    await audit({
      userId: auth.user.id,
      action: 'application.status_updated',
      entityType: 'application',
      entityId: id,
      metadata: { from: existing.status, to: application.status },
      ip: request.ip,
    });
    return { application };
  });

  app.delete('/api/applications/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const existing = await prisma.application.findFirst({
      where: { id, profileId: auth.profile.id, deletedAt: null },
    });
    if (!existing) throw new HttpError(404, 'Application not found');
    if (['APPLYING', 'INTERVIEW', 'FINAL_ROUND'].includes(existing.status)) {
      throw new HttpError(400, 'Active applications cannot be deleted. Archive them instead.');
    }
    await prisma.application.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit({
      userId: auth.user.id,
      action: 'application.deleted',
      entityType: 'application',
      entityId: id,
      ip: request.ip,
    });
    return { ok: true };
  });

  app.post('/api/applications/:id/answers', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({ questions: z.array(z.string().min(3).max(2000)).min(1).max(40) }).parse(request.body);
    const application = await prisma.application.findFirst({
      where: { id, profileId: auth.profile.id, deletedAt: null },
      include: { job: true },
    });
    if (!application) throw new HttpError(404, 'Application not found');
    const resume = await prisma.resume.findFirst({
      where: { profileId: auth.profile.id, isMaster: true, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    const answers = await generateApplicationAnswers(auth.profile, resume, application.job, input.questions);
    await saveApplicationAnswers(application.id, answers);
    await audit({
      userId: auth.user.id,
      action: 'application.answers_generated',
      entityType: 'application',
      entityId: application.id,
      metadata: { count: answers.length, humanReview: answers.filter((answer) => answer.status === 'HUMAN_REVIEW').length },
      ip: request.ip,
    });
    const saved = await prisma.applicationAnswer.findMany({
      where: { applicationId: application.id },
      orderBy: { createdAt: 'asc' },
    });
    return { answers: saved };
  });

  app.get('/api/applications/:id/answers', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const application = await prisma.application.findFirst({
      where: { id, profileId: auth.profile.id, deletedAt: null },
    });
    if (!application) throw new HttpError(404, 'Application not found');
    const answers = await prisma.applicationAnswer.findMany({
      where: { applicationId: id },
      orderBy: { createdAt: 'asc' },
    });
    return { answers };
  });

  app.patch('/api/applications/:id/answers/:answerId', async (request) => {
    const auth = requireProfile(request);
    const { id, answerId } = z
      .object({ id: z.string().uuid(), answerId: z.string().uuid() })
      .parse(request.params);
    const input = z
      .object({
        answer: z.string().max(5000).optional(),
        status: z.enum(['ANSWERED', 'HUMAN_REVIEW', 'APPROVED', 'REJECTED']).optional(),
      })
      .parse(request.body);
    const application = await prisma.application.findFirst({
      where: { id, profileId: auth.profile.id, deletedAt: null },
    });
    if (!application) throw new HttpError(404, 'Application not found');
    const answer = await prisma.applicationAnswer.findFirst({
      where: { id: answerId, applicationId: id },
    });
    if (!answer) throw new HttpError(404, 'Answer not found');
    const updated = await prisma.applicationAnswer.update({
      where: { id: answerId },
      data: {
        answer: input.answer,
        status: input.status ?? (input.answer !== undefined ? 'ANSWERED' : undefined),
        source: input.answer !== undefined ? 'human_edit' : undefined,
      },
    });
    await audit({
      userId: auth.user.id,
      action: 'application.answer_edited',
      entityType: 'applicationAnswer',
      entityId: answerId,
      metadata: { applicationId: id },
      ip: request.ip,
    });
    return { answer: updated };
  });

  app.post('/api/applications/:id/request-approval', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const application = await prisma.application.findFirst({
      where: { id, profileId: auth.profile.id, deletedAt: null },
      include: { job: true, answers: true },
    });
    if (!application) throw new HttpError(404, 'Application not found');
    if (application.status === 'SUBMITTED') throw new HttpError(409, 'Application is already submitted');
    const score = await prisma.jobScore.findFirst({
      where: { jobId: application.jobId, profileId: auth.profile.id },
      orderBy: { createdAt: 'desc' },
    });
    const humanReview = application.answers.filter((answer) => answer.status === 'HUMAN_REVIEW');
    const approval = await getOrCreateApproval({
      profileId: auth.profile.id,
      type: 'APPLICATION_SUBMISSION',
      entityType: 'application',
      entityId: application.id,
      title: `Application: ${application.job.title} at ${application.job.company}`,
      content: [
        `Application for ${application.job.title} at ${application.job.company}`,
        score ? `Match score: ${score.overallScore}/100 (${score.recommendation})` : '',
        humanReview.length > 0
          ? `Human review required for: ${humanReview.map((answer) => answer.question).join('; ')}`
          : 'All generated answers are evidence-backed.',
      ]
        .filter(Boolean)
        .join('\n'),
      metadata: {
        applicationId: application.id,
        jobId: application.jobId,
        humanReviewQuestions: humanReview.map((answer) => answer.question),
      },
      priority: 80,
      expiresInHours: 24 * 21,
    });
    await prisma.application.update({
      where: { id: application.id },
      data: { status: 'READY_FOR_APPROVAL', lastActivityAt: new Date() },
    });
    return { approval };
  });

  app.get('/api/applications/:id/timeline', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const application = await prisma.application.findFirst({
      where: { id, profileId: auth.profile.id, deletedAt: null },
      select: { id: true },
    });
    if (!application) throw new HttpError(404, 'Application not found');
    const logs = await prisma.auditLog.findMany({
      where: { entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { timeline: logs.map((log) => ({ ...log, metadata: log.metadata as Record<string, unknown> })) };
  });

  app.post('/api/applications/:id/notes', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({ note: z.string().min(1).max(5000) }).parse(request.body);
    const application = await prisma.application.findFirst({
      where: { id, profileId: auth.profile.id, deletedAt: null },
    });
    if (!application) throw new HttpError(404, 'Application not found');
    await audit({
      userId: auth.user.id,
      action: 'application.note',
      entityType: 'application',
      entityId: id,
      metadata: jsonValue({ note: input.note }),
      ip: request.ip,
    });
    return { ok: true };
  });
}
