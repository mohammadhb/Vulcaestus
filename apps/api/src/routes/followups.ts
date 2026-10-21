import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, type FollowUpStatus } from '@vulcaestus/db';
import { requireProfile } from '../auth.js';
import { HttpError, asString, audit } from '../lib/http.js';
import { getOrCreateApproval } from '../services/approval-store.js';
import { listDueFollowUps, runFollowUps } from '../services/followups.js';

export async function followUpRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/followups', async (request) => {
    const auth = requireProfile(request);
    const query = request.query as Record<string, unknown>;
    const status = asString(query.status);
    const followUps = await prisma.followUp.findMany({
      where: {
        profileId: auth.profile.id,
        ...(status ? { status: status as FollowUpStatus } : {}),
      },
      include: {
        application: { include: { job: true } },
        outreach: { include: { contact: true, job: true } },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
    const due = await listDueFollowUps(auth.profile.id);
    return { followUps, dueCount: due.length };
  });

  app.post('/api/followups/run', async (request) => {
    const auth = requireProfile(request);
    const input = z
      .object({
        days: z.number().int().min(1).max(90).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .parse(request.body ?? {});
    const result = await runFollowUps(auth.profile, input);
    await audit({
      userId: auth.user.id,
      action: 'followups.generated',
      entityType: 'followup',
      metadata: result,
      ip: request.ip,
    });
    return result;
  });

  app.post('/api/followups/:id/request-approval', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const followUp = await prisma.followUp.findFirst({
      where: { id, profileId: auth.profile.id },
      include: { application: { include: { job: true } }, outreach: { include: { contact: true } } },
    });
    if (!followUp) throw new HttpError(404, 'Follow-up not found');
    if (!followUp.message) throw new HttpError(400, 'Follow-up has no message. Generate or write one first.');
    const approval = await getOrCreateApproval({
      profileId: auth.profile.id,
      type: 'FOLLOWUP',
      entityType: 'followup',
      entityId: followUp.id,
      title: `Follow up: ${followUp.application?.job.title ?? followUp.outreach?.contact.name ?? 'contact'}`,
      content: followUp.message,
      metadata: {
        followUpId: followUp.id,
        applicationId: followUp.applicationId,
        outreachId: followUp.outreachId,
        type: followUp.type,
      },
      priority: 55,
      expiresInHours: 24 * 7,
    });
    await prisma.followUp.update({
      where: { id },
      data: { status: 'AWAITING_APPROVAL' },
    });
    return { approval };
  });

  app.patch('/api/followups/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z
      .object({
        message: z.string().max(5000).optional(),
        dueAt: z.coerce.date().optional(),
        status: z.enum(['SCHEDULED', 'DUE', 'AWAITING_APPROVAL', 'SENT', 'CANCELLED', 'FAILED']).optional(),
      })
      .parse(request.body);
    const existing = await prisma.followUp.findFirst({
      where: { id, profileId: auth.profile.id },
    });
    if (!existing) throw new HttpError(404, 'Follow-up not found');
    const followUp = await prisma.followUp.update({ where: { id }, data: input });
    await audit({
      userId: auth.user.id,
      action: 'followup.updated',
      entityType: 'followup',
      entityId: id,
      metadata: { fields: Object.keys(input) },
      ip: request.ip,
    });
    return { followUp };
  });

  app.delete('/api/followups/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const existing = await prisma.followUp.findFirst({
      where: { id, profileId: auth.profile.id },
    });
    if (!existing) throw new HttpError(404, 'Follow-up not found');
    await prisma.followUp.update({ where: { id }, data: { status: 'CANCELLED' } });
    await prisma.approvalRequest.updateMany({
      where: { entityId: id, profileId: auth.profile.id, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    return { ok: true };
  });
}
