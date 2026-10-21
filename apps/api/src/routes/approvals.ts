import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, type Prisma } from '@vulcaestus/db';
import { APPROVAL_TYPES } from '@vulcaestus/types';
import { requireProfile } from '../auth.js';
import { HttpError, asString, audit, jsonValue } from '../lib/http.js';
import {
  approveApproval,
  bulkApprove,
  editApproval,
  postponeApproval,
  rejectApproval,
} from '../services/approvals.js';
import { regenerateOutreach } from '../services/outreach.js';

export async function approvalRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/approvals', async (request) => {
    const auth = requireProfile(request);
    const query = request.query as Record<string, unknown>;
    const status = asString(query.status) ?? 'PENDING';
    const type = asString(query.type);
    const priority = query.priority ? Number(query.priority) : undefined;
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50) || 50));
    const where: Prisma.ApprovalRequestWhereInput = {
      profileId: auth.profile.id,
      ...(status !== 'all' ? { status: status as 'PENDING' } : {}),
      ...(type ? { type: type as 'LINKEDIN_MESSAGE' } : {}),
      ...(priority ? { priority: { gte: priority } } : {}),
    };
    const [approvals, counts] = await Promise.all([
      prisma.approvalRequest.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: limit,
      }),
      prisma.approvalRequest.groupBy({
        by: ['type', 'status'],
        where: { profileId: auth.profile.id },
        _count: { _all: true },
      }),
    ]);
    return {
      approvals: approvals.map((approval) => ({
        ...approval,
        metadata: approval.metadata as Record<string, unknown>,
      })),
      counts: counts.map((row) => ({
        type: row.type,
        status: row.status,
        count: row._count._all,
      })),
    };
  });

  app.get('/api/approvals/counts', async (request) => {
    const auth = requireProfile(request);
    const grouped = await prisma.approvalRequest.groupBy({
      by: ['type'],
      where: { profileId: auth.profile.id, status: 'PENDING' },
      _count: { _all: true },
    });
    const total = grouped.reduce((sum, row) => sum + row._count._all, 0);
    return {
      total,
      byType: Object.fromEntries(grouped.map((row) => [row.type, row._count._all])),
    };
  });

  app.get('/api/approvals/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const approval = await prisma.approvalRequest.findFirst({
      where: { id, profileId: auth.profile.id },
    });
    if (!approval) throw new HttpError(404, 'Approval not found');

    let related: unknown = null;
    if (approval.entityType === 'application') {
      related = await prisma.application.findFirst({
        where: { id: approval.entityId, profileId: auth.profile.id },
        include: {
          job: true,
          answers: { orderBy: { createdAt: 'asc' } },
          browserActions: { orderBy: { createdAt: 'desc' } },
        },
      });
    } else if (approval.entityType === 'outreach') {
      related = await prisma.outreachMessage.findFirst({
        where: { id: approval.entityId, profileId: auth.profile.id },
        include: { contact: true, job: true },
      });
    } else if (approval.entityType === 'followup') {
      related = await prisma.followUp.findFirst({
        where: { id: approval.entityId, profileId: auth.profile.id },
        include: { application: { include: { job: true } }, outreach: { include: { contact: true } } },
      });
    }
    return {
      approval: { ...approval, metadata: approval.metadata as Record<string, unknown> },
      related,
    };
  });

  app.post('/api/approvals/:id/approve', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({ note: z.string().max(2000).optional() }).parse(request.body ?? {});
    const result = await approveApproval({
      approvalId: id,
      profileId: auth.profile.id,
      userId: auth.user.id,
      note: input.note,
    });
    return {
      approval: result.approval,
      warning: result.warning,
    };
  });

  app.post('/api/approvals/:id/reject', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({ note: z.string().max(2000).optional() }).parse(request.body ?? {});
    const approval = await rejectApproval({
      approvalId: id,
      profileId: auth.profile.id,
      userId: auth.user.id,
      note: input.note,
    });
    return { approval };
  });

  app.patch('/api/approvals/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z
      .object({
        content: z.string().min(1).max(10000).optional(),
        subject: z.string().max(300).optional(),
        metadata: z.record(z.unknown()).optional(),
      })
      .parse(request.body);
    const approval = await editApproval({
      approvalId: id,
      profileId: auth.profile.id,
      userId: auth.user.id,
      content: input.content,
      subject: input.subject,
      metadata: input.metadata,
    });
    return { approval };
  });

  app.post('/api/approvals/:id/postpone', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({ hours: z.number().int().min(1).max(24 * 30) }).parse(request.body);
    const approval = await postponeApproval({
      approvalId: id,
      profileId: auth.profile.id,
      userId: auth.user.id,
      hours: input.hours,
    });
    return { approval };
  });

  app.post('/api/approvals/:id/regenerate', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const approval = await prisma.approvalRequest.findFirst({
      where: { id, profileId: auth.profile.id },
    });
    if (!approval) throw new HttpError(404, 'Approval not found');
    if (approval.status !== 'PENDING') throw new HttpError(409, 'Only pending approvals can be regenerated');
    if (!['LINKEDIN_MESSAGE', 'REFERRAL_REQUEST'].includes(approval.type)) {
      throw new HttpError(400, 'Only outreach messages can be regenerated');
    }
    const outreach = await regenerateOutreach({
      outreachId: approval.entityId,
      profileId: auth.profile.id,
    });
    const updated = await prisma.approvalRequest.update({
      where: { id: approval.id },
      data: {
        content: outreach.body,
        metadata: jsonValue({
          ...(approval.metadata as Record<string, unknown>),
          regeneratedAt: new Date().toISOString(),
        }),
      },
    });
    await audit({
      userId: auth.user.id,
      action: 'approval.regenerated',
      entityType: 'outreach',
      entityId: outreach.id,
      metadata: { approvalId: approval.id },
      ip: request.ip,
    });
    return { approval: updated, outreach };
  });

  app.post('/api/approvals/bulk-approve', async (request) => {
    const auth = requireProfile(request);
    const input = z
      .object({ approvalIds: z.array(z.string().uuid()).min(1).max(100) })
      .parse(request.body);
    const result = await bulkApprove({
      approvalIds: input.approvalIds,
      profileId: auth.profile.id,
      userId: auth.user.id,
    });
    return result;
  });

  app.post('/api/approvals/:id/expire', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const approval = await prisma.approvalRequest.findFirst({
      where: { id, profileId: auth.profile.id },
    });
    if (!approval) throw new HttpError(404, 'Approval not found');
    if (approval.status !== 'PENDING') throw new HttpError(409, 'Only pending approvals can be expired');
    await prisma.approvalRequest.update({ where: { id }, data: { status: 'EXPIRED' } });
    return { ok: true };
  });

  app.get('/api/approvals/types', async () => ({ types: APPROVAL_TYPES }));
}
