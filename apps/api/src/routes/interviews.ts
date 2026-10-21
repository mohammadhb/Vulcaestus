import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@vulcaestus/db';
import { requireProfile } from '../auth.js';
import { HttpError, audit } from '../lib/http.js';
import { createInterview, prepareInterviewBriefing } from '../services/interviews.js';

export async function interviewRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/interviews', async (request) => {
    const auth = requireProfile(request);
    const query = request.query as Record<string, unknown>;
    const upcoming = query.upcoming === 'true';
    const interviews = await prisma.interview.findMany({
      where: {
        profileId: auth.profile.id,
        ...(upcoming ? { scheduledAt: { gte: new Date() } } : {}),
      },
      include: {
        job: { select: { id: true, title: true, company: true, location: true } },
        application: { select: { id: true, status: true } },
      },
      orderBy: { scheduledAt: upcoming ? 'asc' : 'desc' },
      take: 100,
    });
    return { interviews };
  });

  app.post('/api/interviews', async (request, reply) => {
    const auth = requireProfile(request);
    const input = z
      .object({
        applicationId: z.string().uuid(),
        stage: z.string().min(1).max(120),
        scheduledAt: z.coerce.date(),
        interviewer: z.string().max(300).optional(),
        location: z.string().max(300).optional(),
        notes: z.string().max(5000).optional(),
      })
      .parse(request.body);
    const interview = await createInterview({ profile: auth.profile, ...input });
    await audit({
      userId: auth.user.id,
      action: 'interview.created',
      entityType: 'interview',
      entityId: interview.id,
      metadata: { applicationId: input.applicationId, stage: input.stage },
      ip: request.ip,
    });
    return reply.code(201).send({ interview });
  });

  app.get('/api/interviews/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const interview = await prisma.interview.findFirst({
      where: { id, profileId: auth.profile.id },
      include: { job: true, application: true },
    });
    if (!interview) throw new HttpError(404, 'Interview not found');
    return { interview };
  });

  app.post('/api/interviews/:id/prepare', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await prepareInterviewBriefing(auth.profile, id);
    await audit({
      userId: auth.user.id,
      action: 'interview.briefing_generated',
      entityType: 'interview',
      entityId: id,
      ip: request.ip,
    });
    return result;
  });

  app.patch('/api/interviews/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z
      .object({
        stage: z.string().min(1).max(120).optional(),
        scheduledAt: z.coerce.date().optional(),
        interviewer: z.string().max(300).nullable().optional(),
        location: z.string().max(300).nullable().optional(),
        notes: z.string().max(5000).nullable().optional(),
      })
      .parse(request.body);
    const existing = await prisma.interview.findFirst({
      where: { id, profileId: auth.profile.id },
    });
    if (!existing) throw new HttpError(404, 'Interview not found');
    const interview = await prisma.interview.update({ where: { id }, data: input });
    await audit({
      userId: auth.user.id,
      action: 'interview.updated',
      entityType: 'interview',
      entityId: id,
      metadata: { fields: Object.keys(input) },
      ip: request.ip,
    });
    return { interview };
  });

  app.delete('/api/interviews/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const existing = await prisma.interview.findFirst({
      where: { id, profileId: auth.profile.id },
    });
    if (!existing) throw new HttpError(404, 'Interview not found');
    await prisma.interview.delete({ where: { id } });
    await audit({
      userId: auth.user.id,
      action: 'interview.deleted',
      entityType: 'interview',
      entityId: id,
      ip: request.ip,
    });
    return { ok: true };
  });
}
