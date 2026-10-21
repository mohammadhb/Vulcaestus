import { prisma, type ApprovalRequest, type ApprovalType } from '@vulcaestus/db';
import { jsonValue } from '../lib/http.js';

export async function getOrCreateApproval(input: {
  profileId: string;
  type: ApprovalType;
  entityType: string;
  entityId: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  priority?: number;
  expiresInHours?: number;
}): Promise<ApprovalRequest> {
  const existing = await prisma.approvalRequest.findFirst({
    where: {
      profileId: input.profileId,
      type: input.type,
      entityId: input.entityId,
      status: 'PENDING',
    },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    return prisma.approvalRequest.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        content: input.content,
        metadata: jsonValue(input.metadata ?? {}),
        priority: input.priority ?? existing.priority,
      },
    });
  }
  return prisma.approvalRequest.create({
    data: {
      profileId: input.profileId,
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      title: input.title,
      content: input.content,
      metadata: jsonValue(input.metadata ?? {}),
      priority: input.priority ?? 50,
      expiresAt: input.expiresInHours
        ? new Date(Date.now() + input.expiresInHours * 3600 * 1000)
        : null,
    },
  });
}
