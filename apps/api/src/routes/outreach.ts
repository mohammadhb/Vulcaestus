import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, type OutreachStatus } from '@vulcaestus/db';
import { MESSAGE_TYPES } from '@vulcaestus/types';
import { requireProfile } from '../auth.js';
import { HttpError, asString, audit, getPagination } from '../lib/http.js';
import { getOrCreateApproval } from '../services/approval-store.js';
import { generateOutreach, regenerateOutreach } from '../services/outreach.js';
import { evaluateApprovalGate } from '../services/gating.js';
import { incrementLimit } from '../lib/limits.js';

export async function outreachRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/outreach', async (request) => {
    const auth = requireProfile(request);
    const query = request.query as Record<string, unknown>;
    const { page, pageSize, skip, take } = getPagination(query);
    const status = asString(query.status);
    const type = asString(query.type);
    const messages = await prisma.outreachMessage.findMany({
      where: {
        profileId: auth.profile.id,
        ...(status ? { status: status as OutreachStatus } : {}),
        ...(type ? { type: type as 'CONNECTION_REQUEST' } : {}),
      },
      include: {
        contact: true,
        job: { select: { id: true, title: true, company: true } },
        followUps: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
    const total = await prisma.outreachMessage.count({
      where: {
        profileId: auth.profile.id,
        ...(status ? { status: status as OutreachStatus } : {}),
      },
    });
    return { messages, total, page, pageSize };
  });

  app.get('/api/outreach/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const message = await prisma.outreachMessage.findFirst({
      where: { id, profileId: auth.profile.id },
      include: { contact: true, job: true },
    });
    if (!message) throw new HttpError(404, 'Outreach message not found');
    const approvals = await prisma.approvalRequest.findMany({
      where: { entityId: message.id, profileId: auth.profile.id },
      orderBy: { createdAt: 'desc' },
    });
    return { message, approvals };
  });

  app.post('/api/outreach', async (request, reply) => {
    const auth = requireProfile(request);
    const input = z
      .object({
        contactId: z.string().uuid(),
        jobId: z.string().uuid().optional(),
        applicationId: z.string().uuid().optional(),
        type: z.enum(MESSAGE_TYPES),
        tone: z.string().max(200).optional(),
      })
      .parse(request.body);
    const contact = await prisma.contact.findFirst({
      where: { id: input.contactId, profileId: auth.profile.id, deletedAt: null },
    });
    if (!contact) throw new HttpError(404, 'Contact not found');
    const job = input.jobId
      ? await prisma.job.findFirst({
          where: { id: input.jobId, profileId: auth.profile.id, deletedAt: null },
        })
      : null;
    if (input.jobId && !job) throw new HttpError(404, 'Job not found');
    const message = await generateOutreach({
      profile: auth.profile,
      contact,
      job,
      applicationId: input.applicationId,
      type: input.type,
      tone: input.tone,
    });
    await audit({
      userId: auth.user.id,
      action: 'message.generated',
      entityType: 'outreach',
      entityId: message.id,
      metadata: { type: message.type, contactId: contact.id, jobId: job?.id },
      ip: request.ip,
    });
    return reply.code(201).send({ message });
  });

  app.patch('/api/outreach/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z
      .object({
        body: z.string().min(1).max(3000).optional(),
        subject: z.string().max(300).nullable().optional(),
      })
      .parse(request.body);
    const message = await prisma.outreachMessage.findFirst({
      where: { id, profileId: auth.profile.id },
    });
    if (!message) throw new HttpError(404, 'Outreach message not found');
    if (!['DRAFT', 'PENDING_APPROVAL'].includes(message.status)) {
      throw new HttpError(409, 'Only draft or pending messages can be edited');
    }
    const updated = await prisma.outreachMessage.update({
      where: { id },
      data: { body: input.body, subject: input.subject },
    });
    await prisma.approvalRequest.updateMany({
      where: { entityId: id, profileId: auth.profile.id, status: 'PENDING' },
      data: { content: updated.body },
    });
    await audit({
      userId: auth.user.id,
      action: 'message.edited',
      entityType: 'outreach',
      entityId: id,
      ip: request.ip,
    });
    return { message: updated };
  });

  app.post('/api/outreach/:id/request-approval', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const message = await prisma.outreachMessage.findFirst({
      where: { id, profileId: auth.profile.id },
      include: { contact: true, job: true },
    });
    if (!message) throw new HttpError(404, 'Outreach message not found');
    const approval = await getOrCreateApproval({
      profileId: auth.profile.id,
      type: message.type === 'REFERRAL_REQUEST' ? 'REFERRAL_REQUEST' : 'LINKEDIN_MESSAGE',
      entityType: 'outreach',
      entityId: message.id,
      title: `${message.type.replace(/_/g, ' ').toLowerCase()} to ${message.contact.name}`,
      content: message.body,
      metadata: {
        contactId: message.contactId,
        contactName: message.contact.name,
        contactTitle: message.contact.title,
        company: message.contact.company,
        relationship: message.contact.relationship,
        jobId: message.jobId,
        jobTitle: message.job?.title,
        messageType: message.type,
        linkedinUrl: message.contact.linkedinUrl,
      },
      priority: 60,
      expiresInHours: 24 * 14,
    });
    await prisma.outreachMessage.update({
      where: { id },
      data: { status: 'PENDING_APPROVAL' },
    });
    return { approval };
  });

  app.post('/api/outreach/:id/regenerate', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const message = await regenerateOutreach({ outreachId: id, profileId: auth.profile.id });
    await audit({
      userId: auth.user.id,
      action: 'message.regenerated',
      entityType: 'outreach',
      entityId: id,
      metadata: { model: message.model },
      ip: request.ip,
    });
    return { message };
  });

  app.post('/api/outreach/:id/mark-sent', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({ note: z.string().max(2000).optional() }).parse(request.body ?? {});
    const message = await prisma.outreachMessage.findFirst({
      where: { id, profileId: auth.profile.id },
    });
    if (!message) throw new HttpError(404, 'Outreach message not found');
    if (message.status === 'SENT') throw new HttpError(409, 'Message is already marked sent');
    if (!['APPROVED', 'SCHEDULED'].includes(message.status)) {
      throw new HttpError(409, 'Only approved messages can be marked sent');
    }
    const approval = await prisma.approvalRequest.findFirst({
      where: {
        entityId: message.id,
        profileId: auth.profile.id,
        type: { in: ['LINKEDIN_MESSAGE', 'REFERRAL_REQUEST'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    const gate = evaluateApprovalGate({
      approval,
      expectedType: approval?.type ?? 'LINKEDIN_MESSAGE',
      entityId: message.id,
    });
    if (!gate.ok) throw new HttpError(403, gate.reason ?? 'Message is not approved');

    const updated = await prisma.outreachMessage.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sentBy: `user:${auth.user.id}`,
        error: null,
      },
    });
    await incrementLimit(auth.profile.id, message.type === 'CONNECTION_REQUEST' ? 'connectionsSent' : 'messagesSent');
    await audit({
      userId: auth.user.id,
      action: 'message.marked_sent',
      entityType: 'outreach',
      entityId: id,
      metadata: { note: input.note, approvalId: approval?.id },
      ip: request.ip,
    });
    return { message: updated };
  });

  app.delete('/api/outreach/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const message = await prisma.outreachMessage.findFirst({
      where: { id, profileId: auth.profile.id },
    });
    if (!message) throw new HttpError(404, 'Outreach message not found');
    if (message.status === 'SENT') throw new HttpError(409, 'Sent messages cannot be cancelled');
    await prisma.outreachMessage.update({ where: { id }, data: { status: 'CANCELLED' } });
    await prisma.approvalRequest.updateMany({
      where: { entityId: id, profileId: auth.profile.id, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    return { ok: true };
  });
}
