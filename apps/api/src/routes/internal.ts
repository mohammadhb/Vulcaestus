import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, type BrowserActionStatus, type JobSourceKind } from '@vulcaestus/db';
import { jobInputSchema } from '@vulcaestus/types';
import { env } from '../env.js';
import { HttpError, audit, jsonValue } from '../lib/http.js';
import { safeEqual } from '../lib/crypto.js';
import { incrementLimit } from '../lib/limits.js';
import { notify } from '../lib/notify.js';
import { runSource } from '../services/jobs/sources.js';
import { ingestJobs } from '../services/jobs/ingest.js';
import { runFollowUps } from '../services/followups.js';
import { getOrCreateApproval } from '../services/approval-store.js';
import { scoreJobForProfile } from '../services/jobs/score.js';
import { generateTailoredResume } from '../services/tailoring.js';
import { prepareApplication } from '../services/applications.js';
import { rankContactsForJob } from '../services/referrals.js';
import { dispatchBrowserAction } from '../services/browser.js';
import { prepareInterviewBriefing } from '../services/interviews.js';
import { analyticsSummary } from '../services/analytics.js';

function verifyService(request: { headers: Record<string, unknown> }): void {
  const key = request.headers['x-api-key'];
  if (typeof key !== 'string' || !safeEqual(key, env.SERVICE_API_KEY)) {
    throw new HttpError(401, 'Invalid service API key');
  }
}

function verifyWorker(request: { headers: Record<string, unknown> }): void {
  const secret = request.headers['x-worker-secret'];
  if (typeof secret !== 'string' || !safeEqual(secret, env.BROWSER_WORKER_SECRET)) {
    throw new HttpError(401, 'Invalid worker secret');
  }
}

async function resolveProfileId(explicit?: string): Promise<string> {
  if (explicit) {
    const profile = await prisma.candidateProfile.findUnique({ where: { id: explicit } });
    if (!profile) throw new HttpError(404, 'Profile not found');
    return profile.id;
  }
  const profiles = await prisma.candidateProfile.findMany({ take: 2, orderBy: { createdAt: 'asc' } });
  if (profiles.length === 0) throw new HttpError(400, 'No candidate profile exists');
  if (profiles.length > 1) throw new HttpError(400, 'Multiple profiles exist. Pass profileId explicitly.');
  return profiles[0]!.id;
}

const callbackSchema = z.object({
  status: z.enum(['SUCCEEDED', 'FAILED', 'AWAITING_HUMAN', 'SIMULATED', 'CANCELLED']),
  result: z.record(z.unknown()).optional(),
  screenshots: z.array(z.string().max(1000)).optional(),
  error: z.string().max(4000).optional(),
  reason: z.string().max(2000).optional(),
  confirmationRef: z.string().max(500).optional(),
  currentUrl: z.string().max(2000).optional(),
});

export async function internalRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/internal/jobs/ingest', async (request) => {
    verifyService(request);
    const input = z
      .object({
        profileId: z.string().uuid().optional(),
        jobs: z.array(jobInputSchema).min(1).max(500),
      })
      .parse(request.body);
    const profileId = await resolveProfileId(input.profileId);
    const result = await ingestJobs(input.jobs, { profileId, limit: input.jobs.length });
    await audit({
      action: 'jobs.ingested_internal',
      entityType: 'job',
      metadata: { created: result.created, duplicates: result.duplicates, errors: result.errors },
    });
    return { created: result.created, duplicates: result.duplicates, errors: result.errors, jobIds: result.jobs.map((job) => job.id) };
  });

  app.post('/api/internal/jobs/discover', async (request) => {
    verifyService(request);
    const input = z
      .object({
        profileId: z.string().uuid().optional(),
        sourceIds: z.array(z.string().uuid()).optional(),
        limit: z.number().int().min(1).max(1000).optional(),
      })
      .parse(request.body ?? {});
    const profileId = await resolveProfileId(input.profileId);
    const sources = await prisma.jobSource.findMany({
      where: {
        enabled: true,
        ...(input.sourceIds ? { id: { in: input.sourceIds } } : {}),
      },
    });
    const results: Array<{ source: string; fetched: number; created: number; duplicates: number; error?: string }> = [];
    let remaining = input.limit ?? env.MAX_JOBS_PER_DAY;
    for (const source of sources) {
      if (remaining <= 0) break;
      try {
        const { jobs } = await runSource(source);
        const ingest = await ingestJobs(jobs.slice(0, remaining), {
          sourceId: source.id,
          profileId,
          limit: remaining,
        });
        remaining -= ingest.created;
        results.push({
          source: source.name,
          fetched: jobs.length,
          created: ingest.created,
          duplicates: ingest.duplicates,
        });
        await prisma.jobSource.update({ where: { id: source.id }, data: { lastRunAt: new Date(), lastError: null } });
      } catch (error) {
        results.push({ source: source.name, fetched: 0, created: 0, duplicates: 0, error: (error as Error).message });
        await prisma.jobSource.update({
          where: { id: source.id },
          data: { lastRunAt: new Date(), lastError: (error as Error).message.slice(0, 2000) },
        });
      }
    }
    return { profileId, results };
  });

  app.post('/api/internal/sources/seed', async (request) => {
    verifyService(request);
    const defaults: Array<{ name: string; kind: JobSourceKind; config: Record<string, unknown> }> = [
      { name: 'Remotive (remote jobs)', kind: 'REMOTIVE', config: {} },
      { name: 'LinkedIn (manual import only)', kind: 'LINKEDIN_MANUAL', config: {} },
    ];
    let created = 0;
    for (const source of defaults) {
      const exists = await prisma.jobSource.findUnique({ where: { name: source.name } });
      if (exists) continue;
      await prisma.jobSource.create({
        data: { name: source.name, kind: source.kind, enabled: source.kind === 'REMOTIVE', config: jsonValue(source.config) },
      });
      created += 1;
    }
    return { created };
  });

  app.post('/api/internal/followups/run', async (request) => {
    verifyService(request);
    const input = z
      .object({
        profileId: z.string().uuid().optional(),
        days: z.number().int().min(1).max(90).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .parse(request.body ?? {});
    const profileId = await resolveProfileId(input.profileId);
    const profile = await prisma.candidateProfile.findUniqueOrThrow({ where: { id: profileId } });
    const result = await runFollowUps(profile, input);
    return { profileId, ...result };
  });

  app.post('/api/internal/jobs/score-batch', async (request) => {
    verifyService(request);
    const input = z
      .object({ profileId: z.string().uuid().optional(), limit: z.number().int().min(1).max(50).default(10) })
      .parse(request.body ?? {});
    const profileId = await resolveProfileId(input.profileId);
    const profile = await prisma.candidateProfile.findUniqueOrThrow({ where: { id: profileId } });
    const resume = await prisma.resume.findFirst({
      where: { profileId, isMaster: true, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    const jobs = await prisma.job.findMany({
      where: { deletedAt: null, scores: { none: { profileId } } },
      orderBy: { discoveredAt: 'desc' },
      take: input.limit,
    });
    const scored: Array<{ jobId: string; score: number; recommendation: string }> = [];
    for (const job of jobs) {
      const score = await scoreJobForProfile(profile, job, resume);
      scored.push({ jobId: job.id, score: score.overallScore, recommendation: score.recommendation });
    }
    return { profileId, scored };
  });

  app.post('/api/internal/jobs/tailor-batch', async (request) => {
    verifyService(request);
    const input = z
      .object({ profileId: z.string().uuid().optional(), limit: z.number().int().min(1).max(20).default(5) })
      .parse(request.body ?? {});
    const profileId = await resolveProfileId(input.profileId);
    const profile = await prisma.candidateProfile.findUniqueOrThrow({ where: { id: profileId } });
    const resume = await prisma.resume.findFirst({
      where: { profileId, isMaster: true, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    if (!resume) return { profileId, generated: [], note: 'No master resume.' };
    const scores = await prisma.jobScore.findMany({
      where: {
        profileId,
        overallScore: { gte: profile.tailorThreshold },
        job: { deletedAt: null, tailoredResumes: { none: { profileId } } },
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit * 2,
      distinct: ['jobId'],
    });
    const generated: Array<{ jobId: string; tailoredResumeId: string }> = [];
    const seen = new Set<string>();
    for (const score of scores) {
      if (generated.length >= input.limit || seen.has(score.jobId)) continue;
      seen.add(score.jobId);
      const job = await prisma.job.findUnique({ where: { id: score.jobId } });
      if (!job) continue;
      const tailored = await generateTailoredResume(profile, resume, job);
      generated.push({ jobId: job.id, tailoredResumeId: tailored.id });
    }
    return { profileId, generated };
  });

  app.post('/api/internal/applications/prepare-batch', async (request) => {
    verifyService(request);
    const input = z
      .object({ profileId: z.string().uuid().optional(), limit: z.number().int().min(1).max(10).default(3) })
      .parse(request.body ?? {});
    const profileId = await resolveProfileId(input.profileId);
    const profile = await prisma.candidateProfile.findUniqueOrThrow({ where: { id: profileId } });
    const scores = await prisma.jobScore.findMany({
      where: {
        profileId,
        overallScore: { gte: profile.tailorThreshold },
        job: { deletedAt: null, applications: { none: { profileId, deletedAt: null } } },
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit * 3,
      distinct: ['jobId'],
    });
    const prepared: Array<{ jobId: string; applicationId: string; warnings: string[] }> = [];
    for (const score of scores) {
      if (prepared.length >= input.limit) break;
      const job = await prisma.job.findUnique({ where: { id: score.jobId } });
      if (!job) continue;
      const result = await prepareApplication(profile, job);
      prepared.push({
        jobId: job.id,
        applicationId: result.application.id,
        warnings: result.warnings,
      });
    }
    return { profileId, prepared };
  });

  app.post('/api/internal/referrals/rank', async (request) => {
    verifyService(request);
    const input = z
      .object({ profileId: z.string().uuid().optional(), limit: z.number().int().min(1).max(20).default(10) })
      .parse(request.body ?? {});
    const profileId = await resolveProfileId(input.profileId);
    const contacts = await prisma.contact.findMany({
      where: { profileId, deletedAt: null },
      take: 200,
    });
    const companies = [...new Set(contacts.map((contact) => contact.company))].slice(0, input.limit);
    const ranked: Array<{ company: string; jobId: string; contacts: number }> = [];
    for (const company of companies) {
      const contact = contacts.find((item) => item.company === company);
      if (!contact) continue;
      const job = await prisma.job.findFirst({
        where: { companyNormalized: { contains: company.toLowerCase().split(/\s+/)[0] ?? company }, deletedAt: null },
        orderBy: { discoveredAt: 'desc' },
      });
      if (!job) continue;
      const result = await rankContactsForJob(profileId, job);
      if (result.length > 0) ranked.push({ company, jobId: job.id, contacts: result.length });
    }
    return { profileId, ranked };
  });

  app.post('/api/internal/interviews/prepare-upcoming', async (request) => {
    verifyService(request);
    const input = z
      .object({ profileId: z.string().uuid().optional(), withinHours: z.number().int().min(1).max(720).default(72) })
      .parse(request.body ?? {});
    const profileId = await resolveProfileId(input.profileId);
    const profile = await prisma.candidateProfile.findUniqueOrThrow({ where: { id: profileId } });
    const interviews = await prisma.interview.findMany({
      where: {
        profileId,
        scheduledAt: {
          gte: new Date(),
          lte: new Date(Date.now() + input.withinHours * 3600 * 1000),
        },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
    });
    const prepared: Array<{ interviewId: string }> = [];
    for (const interview of interviews) {
      if (Object.keys((interview.briefing as Record<string, unknown>) ?? {}).length > 0) continue;
      await prepareInterviewBriefing(profile, interview.id);
      prepared.push({ interviewId: interview.id });
    }
    return { profileId, prepared };
  });

  app.post('/api/internal/browser-actions/retry', async (request) => {
    verifyService(request);
    const input = z
      .object({ profileId: z.string().uuid().optional(), limit: z.number().int().min(1).max(10).default(3) })
      .parse(request.body ?? {});
    const profileId = await resolveProfileId(input.profileId);
    const failed = await prisma.browserAction.findMany({
      where: {
        profileId,
        status: 'FAILED',
        approvalId: { not: null },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit,
    });
    const retried: Array<{ actionId: string; status: string; error?: string }> = [];
    for (const action of failed) {
      if (!action.approvalId) continue;
      if (action.applicationId) {
        const application = await prisma.application.findUnique({ where: { id: action.applicationId } });
        if (!application || ['SUBMITTED', 'APPLYING', 'INTERVIEW', 'FINAL_ROUND', 'OFFER'].includes(application.status)) {
          continue;
        }
      }
      const newerAttempt = await prisma.browserAction.findFirst({
        where: {
          approvalId: action.approvalId,
          id: { not: action.id },
          createdAt: { gt: action.createdAt },
          status: { in: ['QUEUED', 'RUNNING', 'AWAITING_HUMAN', 'SUCCEEDED', 'SIMULATED'] },
        },
      });
      if (newerAttempt) continue;
      const approval = await prisma.approvalRequest.findUnique({ where: { id: action.approvalId } });
      const expectedType =
        approval?.type === 'APPLICATION_SUBMISSION'
          ? 'APPLICATION_SUBMISSION'
          : approval?.type === 'REFERRAL_REQUEST'
            ? 'REFERRAL_REQUEST'
            : 'LINKEDIN_MESSAGE';
      try {
        const next = await dispatchBrowserAction({
          profileId,
          kind: action.kind,
          approvalId: action.approvalId,
          expectedApprovalType: expectedType,
          entityId: approval?.entityId ?? '',
          jobId: action.jobId,
          applicationId: action.applicationId,
          dryRun: action.dryRun,
          request: (action.request as Record<string, unknown>) ?? {},
        });
        retried.push({ actionId: action.id, status: next.status });
      } catch (error) {
        retried.push({ actionId: action.id, status: 'FAILED', error: (error as Error).message });
      }
    }
    return { profileId, retried };
  });

  app.get('/api/internal/analytics/summary', async (request) => {
    verifyService(request);
    const query = request.query as Record<string, unknown>;
    const profileId = await resolveProfileId(
      typeof query.profileId === 'string' ? query.profileId : undefined,
    );
    return analyticsSummary(profileId);
  });

  app.post('/api/internal/notify', async (request) => {
    verifyService(request);
    const input = z.object({ subject: z.string().min(1).max(300), body: z.string().min(1).max(5000) }).parse(request.body);
    await notify(input);
    return { ok: true };
  });

  app.post('/api/internal/browser-actions/:id/callback', async (request) => {
    verifyWorker(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = callbackSchema.parse(request.body);
    const action = await prisma.browserAction.findUnique({ where: { id } });
    if (!action) throw new HttpError(404, 'Browser action not found');
    if (['SUCCEEDED', 'FAILED', 'SIMULATED'].includes(action.status) && action.status === input.status) {
      return { ok: true, duplicate: true };
    }

    const status = input.status as BrowserActionStatus;
    const updated = await prisma.browserAction.update({
      where: { id },
      data: {
        status,
        result: jsonValue({
          ...(input.result ?? {}),
          reason: input.reason,
          currentUrl: input.currentUrl,
        }),
        screenshots: input.screenshots ?? action.screenshots,
        error: input.error,
        finishedAt: status === 'AWAITING_HUMAN' ? null : new Date(),
      },
    });

    const requestData = action.request as Record<string, unknown>;

    if (action.applicationId) {
      const application = await prisma.application.findUnique({
        where: { id: action.applicationId },
        include: { job: true },
      });
      if (application) {
        if (status === 'SUCCEEDED') {
          await prisma.application.update({
            where: { id: application.id },
            data: {
              status: 'SUBMITTED',
              submittedAt: new Date(),
              confirmationRef: input.confirmationRef ?? `browser:${action.id}`,
              lastActivityAt: new Date(),
            },
          });
          await incrementLimit(application.profileId, 'applicationsSubmitted');
          await notify({
            subject: `Application submitted: ${application.job.title} at ${application.job.company}`,
            body: input.confirmationRef
              ? `Confirmed by the browser worker (${input.confirmationRef}).`
              : 'The browser worker detected a successful submission.',
            metadata: { applicationId: application.id, browserActionId: action.id },
          });
        } else if (status === 'AWAITING_HUMAN') {
          await prisma.application.update({
            where: { id: application.id },
            data: { status: 'APPROVED', lastActivityAt: new Date() },
          });
          const approval = await getOrCreateApproval({
            profileId: application.profileId,
            type: 'HUMAN_ACTION',
            entityType: 'application',
            entityId: application.id,
            title: `Human input required: ${application.job.title} at ${application.job.company}`,
            content: `${input.reason ?? 'The browser worker stopped because human input is required (for example a CAPTCHA, login, or unfamiliar form field).'}\n\nOpen the application, complete the required step, then mark this action complete.`,
            metadata: {
              browserActionId: action.id,
              applicationId: application.id,
              currentUrl: input.currentUrl,
              screenshots: input.screenshots ?? action.screenshots,
            },
            priority: 99,
            expiresInHours: 24 * 7,
          });
          await notify({
            subject: `Human input required: ${application.job.title}`,
            body: `${input.reason ?? 'The browser worker stopped.'}\nApproval queue: ${approval.id}`,
            metadata: { applicationId: application.id, browserActionId: action.id, approvalId: approval.id },
          });
        } else if (status === 'FAILED') {
          await notify({
            subject: `Browser submission failed: ${application.job.title}`,
            body: input.error ?? 'Unknown browser worker error. A screenshot may be available.',
            metadata: { applicationId: application.id, browserActionId: action.id },
          });
        }
      }
    }

    const outreachId =
      typeof requestData.outreachId === 'string' ? requestData.outreachId : undefined;
    if (outreachId) {
      const outreach = await prisma.outreachMessage.findUnique({
        where: { id: outreachId },
        include: { contact: true },
      });
      if (outreach) {
        if (status === 'SUCCEEDED' || status === 'AWAITING_HUMAN') {
          await prisma.outreachMessage.update({
            where: { id: outreach.id },
            data: { status: 'SCHEDULED', error: null },
          });
          const approval = await getOrCreateApproval({
            profileId: outreach.profileId,
            type: 'HUMAN_ACTION',
            entityType: 'outreach',
            entityId: outreach.id,
            title: `Send prepared message to ${outreach.contact.name}`,
            content: `The browser worker opened ${outreach.contact.linkedinUrl ?? 'the contact profile'} and prepared the message. Review it and send it manually, then mark this task complete.\n\n${outreach.body}`,
            metadata: {
              outreachId: outreach.id,
              browserActionId: action.id,
              action: 'mark_sent',
              screenshots: input.screenshots ?? action.screenshots,
            },
            priority: 85,
            expiresInHours: 24 * 7,
          });
          await notify({
            subject: `Message ready to send: ${outreach.contact.name}`,
            body: `The browser worker prepared the message. Complete the handoff in the approval queue: ${approval.id}`,
            metadata: { outreachId: outreach.id, browserActionId: action.id, approvalId: approval.id },
          });
        } else if (status === 'FAILED') {
          await prisma.outreachMessage.update({
            where: { id: outreach.id },
            data: { status: 'FAILED', error: input.error },
          });
          await notify({
            subject: `LinkedIn handoff failed: ${outreach.contact.name}`,
            body: input.error ?? 'Unknown browser worker error.',
            metadata: { outreachId: outreach.id, browserActionId: action.id },
          });
        }
      }
    }

    await audit({
      action: 'browser.action_callback',
      entityType: 'browserAction',
      entityId: action.id,
      metadata: { status, screenshots: input.screenshots?.length ?? 0 },
    });
    return { ok: true, action: updated };
  });
}
