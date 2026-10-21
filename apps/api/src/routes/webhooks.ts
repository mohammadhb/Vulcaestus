import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, type ApprovalType } from '@vulcaestus/db';
import { env } from '../env.js';
import { HttpError, audit, jsonValue } from '../lib/http.js';
import { safeEqual } from '../lib/crypto.js';
import { jobInputSchema } from '@vulcaestus/types';
import { ingestJob } from '../services/jobs/ingest.js';
import { scoreJobForProfile } from '../services/jobs/score.js';
import { approveApproval } from '../services/approvals.js';

function verifyWebhook(request: { headers: Record<string, unknown> }): void {
  const secret = request.headers['x-webhook-secret'];
  if (typeof secret !== 'string' || !safeEqual(secret, env.WEBHOOK_SECRET)) {
    throw new HttpError(401, 'Invalid webhook secret');
  }
}

async function defaultProfileId(explicit?: string): Promise<string> {
  if (explicit) {
    const profile = await prisma.candidateProfile.findUnique({ where: { id: explicit } });
    if (!profile) throw new HttpError(404, 'Profile not found');
    return profile.id;
  }
  const profiles = await prisma.candidateProfile.findMany({ take: 2, orderBy: { createdAt: 'asc' } });
  if (profiles.length === 0) throw new HttpError(400, 'No candidate profile exists');
  if (profiles.length > 1) {
    throw new HttpError(400, 'Multiple profiles exist. Pass profileId explicitly.');
  }
  return profiles[0]!.id;
}

async function approveFromWebhook(input: {
  approvalId?: string;
  entityId?: string;
  types?: ApprovalType[];
}): Promise<unknown> {
  const approval = input.approvalId
    ? await prisma.approvalRequest.findUnique({ where: { id: input.approvalId } })
    : await prisma.approvalRequest.findFirst({
        where: {
          entityId: input.entityId,
          status: 'PENDING',
          ...(input.types ? { type: { in: input.types } } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
  if (!approval) throw new HttpError(404, 'Pending approval not found');
  const profile = await prisma.candidateProfile.findUnique({ where: { id: approval.profileId } });
  const result = await approveApproval({
    approvalId: approval.id,
    profileId: approval.profileId,
    userId: profile?.userId ?? approval.profileId,
    note: 'Approved via secure webhook',
  });
  return result;
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/webhooks/:type', async (request) => {
    verifyWebhook(request);
    const { type } = z.object({ type: z.string().min(1).max(80) }).parse(request.params);
    const body = z.record(z.unknown()).parse(request.body ?? {});
    const eventId =
      (typeof body.eventId === 'string' && body.eventId) ||
      (typeof request.headers['x-event-id'] === 'string' && (request.headers['x-event-id'] as string)) ||
      `${type}:${JSON.stringify(body)}`.slice(0, 200);
    const eventIdHash = `${type}:${Buffer.from(eventId).toString('base64url').slice(0, 180)}`;

    const existing = await prisma.webhookEvent.findUnique({ where: { eventId: eventIdHash } });
    if (existing?.processedAt) {
      return { ok: true, duplicate: true, eventId: eventIdHash };
    }
    const record =
      existing ??
      (await prisma.webhookEvent.create({
        data: { eventId: eventIdHash, type, payload: jsonValue(body) },
      }));

    try {
      let result: unknown = { accepted: true };

      switch (type) {
        case 'job-created': {
          const profileId = await defaultProfileId(typeof body.profileId === 'string' ? body.profileId : undefined);
          const jobInput = jobInputSchema.parse(body.job ?? body);
          const ingested = await ingestJob(jobInput, { profileId });
          result = { jobId: ingested.job.id, created: ingested.created, duplicateReason: ingested.duplicateReason };
          break;
        }
        case 'job-approved': {
          const profileId = await defaultProfileId(typeof body.profileId === 'string' ? body.profileId : undefined);
          const jobId = z.string().uuid().parse(body.jobId);
          const job = await prisma.job.findFirst({
            where: { id: jobId, profileId, deletedAt: null },
          });
          if (!job) throw new HttpError(404, 'Job not found');
          const profile = await prisma.candidateProfile.findUniqueOrThrow({ where: { id: profileId } });
          const resume = await prisma.resume.findFirst({
            where: { profileId, isMaster: true, deletedAt: null },
            orderBy: { updatedAt: 'desc' },
          });
          const score = await scoreJobForProfile(profile, job, resume);
          result = { jobId, scoreId: score.id, overallScore: score.overallScore };
          break;
        }
        case 'application-approved': {
          if (typeof body.approvalId === 'string') {
            result = await approveFromWebhook({ approvalId: body.approvalId, types: ['APPLICATION_SUBMISSION'] });
          } else {
            result = await approveFromWebhook({
              entityId: z.string().uuid().parse(body.applicationId),
              types: ['APPLICATION_SUBMISSION'],
            });
          }
          break;
        }
        case 'linkedin-message-approved':
        case 'referral-approved': {
          const types: ApprovalType[] =
            type === 'referral-approved'
              ? ['REFERRAL_REQUEST']
              : ['LINKEDIN_MESSAGE', 'REFERRAL_REQUEST'];
          result = await approveFromWebhook({
            approvalId: typeof body.approvalId === 'string' ? body.approvalId : undefined,
            entityId: typeof body.entityId === 'string' ? body.entityId : undefined,
            types,
          });
          break;
        }
        case 'followup-approved': {
          result = await approveFromWebhook({
            approvalId: typeof body.approvalId === 'string' ? body.approvalId : undefined,
            entityId: typeof body.entityId === 'string' ? body.entityId : undefined,
            types: ['FOLLOWUP'],
          });
          break;
        }
        case 'human-action-complete': {
          if (typeof body.approvalId !== 'string') {
            throw new HttpError(400, 'approvalId is required');
          }
          result = await approveFromWebhook({ approvalId: body.approvalId, types: ['HUMAN_ACTION'] });
          break;
        }
        default:
          throw new HttpError(400, `Unknown webhook type: ${type}`);
      }

      await prisma.webhookEvent.update({
        where: { id: record.id },
        data: { processedAt: new Date() },
      });
      await audit({
        action: `webhook.${type}`,
        entityType: 'webhook',
        entityId: record.id,
        metadata: { eventId: eventIdHash },
      });
      return { ok: true, type, result };
    } catch (error) {
      await prisma.webhookEvent.update({
        where: { id: record.id },
        data: { error: (error as Error).message.slice(0, 4000) },
      });
      throw error;
    }
  });
}
