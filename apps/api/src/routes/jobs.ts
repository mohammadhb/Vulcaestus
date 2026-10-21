import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, type Prisma } from '@vulcaestus/db';
import { jobInputSchema, MESSAGE_TYPES } from '@vulcaestus/types';
import { env } from '../env.js';
import { requireProfile } from '../auth.js';
import { HttpError, asString, audit, getPagination } from '../lib/http.js';
import { checkLimit } from '../lib/limits.js';
import { notify } from '../lib/notify.js';
import { ingestJob, ingestJobs } from '../services/jobs/ingest.js';
import { runSource } from '../services/jobs/sources.js';
import { scoreJobForProfile } from '../services/jobs/score.js';
import {
  buildJobWhere,
  findJobIds,
  matchesScoreFilters,
  parseJobFilters,
  scoreFilterActive,
} from '../services/jobs/query.js';
import {
  cancelBatchRun,
  getBatchRun,
  latestBatchRun,
  startScoreBatch,
} from '../services/jobs/bulk-score.js';
import { generateCoverLetter, generateTailoredResume } from '../services/tailoring.js';
import { prepareApplication } from '../services/applications.js';
import { rankContactsForJob } from '../services/referrals.js';
import { generateOutreach } from '../services/outreach.js';

const jobPatchSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  company: z.string().min(1).max(300).optional(),
  location: z.string().max(300).nullable().optional(),
  remoteType: z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN']).optional(),
  employmentType: z
    .enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP', 'FREELANCE', 'UNKNOWN'])
    .optional(),
  seniority: z
    .enum(['INTERN', 'JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL', 'LEAD', 'DIRECTOR', 'EXECUTIVE', 'UNKNOWN'])
    .optional(),
  salaryMin: z.number().int().min(0).nullable().optional(),
  salaryMax: z.number().int().min(0).nullable().optional(),
  currency: z.string().max(10).nullable().optional(),
  url: z.string().url().nullable().optional(),
  description: z.string().max(100_000).optional(),
  requiredSkills: z.array(z.string()).optional(),
  preferredSkills: z.array(z.string()).optional(),
  industry: z.string().max(200).nullable().optional(),
});

const jobFilterInputSchema = z.object({
  q: z.string().max(300).optional(),
  company: z.string().max(300).optional(),
  source: z.string().max(100).optional(),
  remoteType: z.string().max(40).optional(),
  recommendation: z.string().max(40).optional(),
  minScore: z.union([z.number(), z.string()]).optional(),
  hasApplication: z.string().max(10).optional(),
  view: z.enum(['active', 'archived', 'deleted']).optional(),
  sort: z.enum(['newest', 'score']).optional(),
});

async function ownedJob(profileId: string, jobId: string, includeDeleted = false) {
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      profileId,
      ...(includeDeleted ? {} : { deletedAt: null }),
    },
  });
  if (!job) throw new HttpError(404, 'Job not found');
  return job;
}

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/jobs', async (request) => {
    const auth = requireProfile(request);
    const query = request.query as Record<string, unknown>;
    const filters = parseJobFilters(query);
    const { page, pageSize, skip, take } = getPagination(query);
    const where = buildJobWhere(auth.profile.id, filters);
    const include = {
      scores: {
        where: { profileId: auth.profile.id },
        orderBy: { createdAt: 'desc' as const },
        take: 1,
      },
      applications: {
        where: { profileId: auth.profile.id, deletedAt: null },
        take: 1,
        select: { id: true, status: true },
      },
    };

    const [activeCount, archivedCount, deletedCount, unscoredCount, sourceFacets] = await Promise.all([
      prisma.job.count({ where: { profileId: auth.profile.id, deletedAt: null, archivedAt: null } }),
      prisma.job.count({ where: { profileId: auth.profile.id, deletedAt: null, archivedAt: { not: null } } }),
      prisma.job.count({ where: { profileId: auth.profile.id, deletedAt: { not: null } } }),
      prisma.job.count({
        where: {
          profileId: auth.profile.id,
          deletedAt: null,
          archivedAt: null,
          scores: { none: { profileId: auth.profile.id } },
        },
      }),
      prisma.job.groupBy({
        by: ['source'],
        where: { profileId: auth.profile.id, deletedAt: null },
        _count: { _all: true },
      }),
    ]);
    const counts = { active: activeCount, archived: archivedCount, deleted: deletedCount, unscored: unscoredCount };
    const facets = {
      sources: sourceFacets
        .sort((a, b) => b._count._all - a._count._all)
        .map((row) => row.source),
    };

    if (scoreFilterActive(filters)) {
      const jobs = await prisma.job.findMany({
        where,
        include,
        orderBy: filters.sort === 'score' ? { updatedAt: 'desc' } : { discoveredAt: 'desc' },
        take: 1000,
      });
      const filtered = jobs
        .filter((job) => matchesScoreFilters(job, filters))
        .sort((a, b) =>
          filters.sort === 'score'
            ? (b.scores[0]?.overallScore ?? 0) - (a.scores[0]?.overallScore ?? 0)
            : b.discoveredAt.getTime() - a.discoveredAt.getTime(),
        );
      const items = filtered.slice(skip, skip + take);
      return {
        jobs: items,
        total: filtered.length,
        page,
        pageSize,
        counts,
        facets,
        scores: Object.fromEntries(items.map((job) => [job.id, job.scores[0] ?? null])),
        applications: Object.fromEntries(items.map((job) => [job.id, job.applications[0] ?? null])),
      };
    }

    const [total, jobs] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({
        where,
        include,
        orderBy: filters.sort === 'score' ? { updatedAt: 'desc' } : { discoveredAt: 'desc' },
        skip,
        take,
      }),
    ]);
    return {
      jobs,
      total,
      page,
      pageSize,
      counts,
      facets,
      scores: Object.fromEntries(jobs.map((job) => [job.id, job.scores[0] ?? null])),
      applications: Object.fromEntries(jobs.map((job) => [job.id, job.applications[0] ?? null])),
    };
  });

  app.get('/api/jobs/ids', async (request) => {
    const auth = requireProfile(request);
    const query = request.query as Record<string, unknown>;
    const filters = parseJobFilters(query);
    const quick = z
      .enum(['unscored', 'strong', 'apply', 'no_application', 'all'])
      .parse(asString(query.quick) ?? 'all');
    const ids = await findJobIds(auth.profile.id, filters, quick);
    return { ids, count: ids.length };
  });

  app.get('/api/jobs/batches/active', async (request) => {
    const auth = requireProfile(request);
    const run = await latestBatchRun(auth.profile.id);
    return {
      batch: run && ['QUEUED', 'RUNNING'].includes(run.status) ? run : null,
    };
  });

  app.get('/api/jobs/batches/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { batch: await getBatchRun(auth.profile.id, id) };
  });

  app.post('/api/jobs/batches/:id/cancel', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const batch = await cancelBatchRun(auth.profile.id, id);
    await audit({
      userId: auth.user.id,
      action: 'jobs.score_cancelled',
      entityType: 'batch',
      entityId: id,
      ip: request.ip,
    });
    return { batch };
  });

  app.post('/api/jobs/score-all', async (request) => {
    const auth = requireProfile(request);
    const input = z
      .object({
        scope: z.enum(['unscored', 'filtered', 'selected']).default('unscored'),
        jobIds: z.array(z.string().uuid()).max(500).optional(),
        filters: jobFilterInputSchema.optional(),
        useAi: z.boolean().default(true),
      })
      .parse(request.body ?? {});
    const filters = input.filters ? parseJobFilters(input.filters as Record<string, unknown>) : undefined;
    const batch = await startScoreBatch({
      profileId: auth.profile.id,
      scope: input.scope,
      jobIds: input.jobIds,
      filters,
      useAi: input.useAi,
    });
    await audit({
      userId: auth.user.id,
      action: 'jobs.score_batch_started',
      entityType: 'batch',
      entityId: batch.id,
      metadata: { scope: input.scope, total: batch.total, useAi: input.useAi },
      ip: request.ip,
    });
    return { batch };
  });

  app.post('/api/jobs/bulk', async (request) => {
    const auth = requireProfile(request);
    const input = z
      .object({
        action: z.enum(['archive', 'unarchive', 'delete', 'restore']),
        jobIds: z.array(z.string().uuid()).min(1).max(1000),
      })
      .parse(request.body);
    const data: Prisma.JobUpdateManyMutationInput =
      input.action === 'archive'
        ? { archivedAt: new Date() }
        : input.action === 'unarchive'
          ? { archivedAt: null }
          : input.action === 'delete'
            ? { deletedAt: new Date() }
            : { deletedAt: null };

    const where: Prisma.JobWhereInput = {
      profileId: auth.profile.id,
      id: { in: input.jobIds },
      ...(input.action === 'restore'
        ? {}
        : input.action === 'archive' || input.action === 'unarchive'
          ? { deletedAt: null }
          : {}),
    };
    const result = await prisma.job.updateMany({ where, data });
    await audit({
      userId: auth.user.id,
      action: `jobs.bulk_${input.action}`,
      entityType: 'job',
      metadata: { count: result.count, jobIds: input.jobIds.slice(0, 100) },
      ip: request.ip,
    });
    return { updated: result.count };
  });

  app.post('/api/jobs', async (request, reply) => {
    const auth = requireProfile(request);
    const input = jobInputSchema.parse(request.body);
    const result = await ingestJob(input, { profileId: auth.profile.id });
    if (result.created) {
      await audit({
        userId: auth.user.id,
        action: 'job.discovered',
        entityType: 'job',
        entityId: result.job.id,
        metadata: { source: input.source, title: result.job.title, company: result.job.company },
        ip: request.ip,
      });
    }
    return reply.code(result.created ? 201 : 200).send({
      job: result.job,
      created: result.created,
      duplicateReason: result.duplicateReason,
      duplicateOf: result.duplicateOf,
    });
  });

  app.post('/api/jobs/discover', async (request) => {
    const auth = requireProfile(request);
    const input = z
      .object({ sourceId: z.string().uuid().optional(), limit: z.number().int().min(1).max(500).optional() })
      .parse(request.body ?? {});
    const globalLimit = Math.min(input.limit ?? env.MAX_JOBS_PER_DAY, env.MAX_JOBS_PER_DAY);
    const usage = await checkLimit(auth.profile.id, 'jobsDiscovered', globalLimit);
    if (!usage.allowed) {
      throw new HttpError(429, `Daily job discovery limit reached (${usage.used}/${usage.limit}).`);
    }

    const sources = await prisma.jobSource.findMany({
      where: { enabled: true, ...(input.sourceId ? { id: input.sourceId } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    if (sources.length === 0) {
      return {
        results: [],
        message: 'No enabled job sources. Configure Greenhouse, Lever, Remotive, Ashby, Workable, or RSS in Settings.',
      };
    }

    const results: Array<{
      source: string;
      fetched: number;
      created: number;
      duplicates: number;
      errors: number;
      error?: string;
    }> = [];
    let remaining = Math.max(0, usage.remaining);
    for (const source of sources) {
      if (remaining <= 0) break;
      try {
        const { jobs, note } = await runSource(source);
        const limited = jobs.slice(0, remaining);
        const ingest = await ingestJobs(limited, {
          sourceId: source.id,
          profileId: auth.profile.id,
          limit: remaining,
        });
        remaining -= ingest.created;
        results.push({
          source: source.name,
          fetched: limited.length,
          created: ingest.created,
          duplicates: ingest.duplicates,
          errors: ingest.errors,
          error: note,
        });
        await prisma.jobSource.update({
          where: { id: source.id },
          data: { lastRunAt: new Date(), lastError: null },
        });
      } catch (error) {
        results.push({ source: source.name, fetched: 0, created: 0, duplicates: 0, errors: 1, error: (error as Error).message });
        await prisma.jobSource.update({
          where: { id: source.id },
          data: { lastRunAt: new Date(), lastError: (error as Error).message.slice(0, 2000) },
        });
      }
    }

    const created = results.reduce((sum, result) => sum + result.created, 0);
    await audit({
      userId: auth.user.id,
      action: 'jobs.discovered',
      entityType: 'jobSource',
      metadata: { results, created },
      ip: request.ip,
    });
    if (created > 0) {
      await notify({
        subject: `${created} new job(s) discovered`,
        body: results
          .filter((result) => result.created > 0)
          .map((result) => `${result.source}: ${result.created} new`)
          .join('\n'),
        metadata: { created, profileId: auth.profile.id },
      });
    }
    return { results, created };
  });

  app.get('/api/jobs/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const job = await prisma.job.findFirst({
      where: { id, profileId: auth.profile.id, deletedAt: null },
      include: {
        scores: { where: { profileId: auth.profile.id }, orderBy: { createdAt: 'desc' }, take: 1 },
        applications: { where: { profileId: auth.profile.id, deletedAt: null } },
        tailoredResumes: { where: { profileId: auth.profile.id }, orderBy: { createdAt: 'desc' }, take: 5 },
        coverLetters: { where: { profileId: auth.profile.id }, orderBy: { createdAt: 'desc' }, take: 5 },
        contacts: { where: { profileId: auth.profile.id, deletedAt: null } },
        outreach: { where: { profileId: auth.profile.id }, orderBy: { createdAt: 'desc' }, include: { contact: true } },
        sourceRef: true,
      },
    });
    if (!job) throw new HttpError(404, 'Job not found');
    const application = job.applications[0];
    const approvals = application
      ? await prisma.approvalRequest.findMany({
          where: { entityId: application.id, profileId: auth.profile.id },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const activeBatch = await latestBatchRun(auth.profile.id);
    return {
      job,
      application: application ?? null,
      approvals,
      batch: activeBatch && ['QUEUED', 'RUNNING'].includes(activeBatch.status) ? activeBatch : null,
    };
  });

  app.patch('/api/jobs/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = jobPatchSchema.parse(request.body);
    await ownedJob(auth.profile.id, id);
    const job = await prisma.job.update({ where: { id }, data: input });
    await audit({
      userId: auth.user.id,
      action: 'job.updated',
      entityType: 'job',
      entityId: id,
      metadata: { fields: Object.keys(input) },
      ip: request.ip,
    });
    return { job };
  });

  app.post('/api/jobs/:id/archive', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await ownedJob(auth.profile.id, id);
    const job = await prisma.job.update({ where: { id }, data: { archivedAt: new Date() } });
    await audit({ userId: auth.user.id, action: 'job.archived', entityType: 'job', entityId: id, ip: request.ip });
    return { job };
  });

  app.delete('/api/jobs/:id/archive', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await ownedJob(auth.profile.id, id);
    const job = await prisma.job.update({ where: { id }, data: { archivedAt: null } });
    await audit({ userId: auth.user.id, action: 'job.unarchived', entityType: 'job', entityId: id, ip: request.ip });
    return { job };
  });

  app.delete('/api/jobs/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await ownedJob(auth.profile.id, id);
    const job = await prisma.job.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit({ userId: auth.user.id, action: 'job.deleted', entityType: 'job', entityId: id, ip: request.ip });
    return { job };
  });

  app.post('/api/jobs/:id/restore', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await ownedJob(auth.profile.id, id, true);
    const job = await prisma.job.update({ where: { id }, data: { deletedAt: null } });
    await audit({ userId: auth.user.id, action: 'job.restored', entityType: 'job', entityId: id, ip: request.ip });
    return { job };
  });

  app.post('/api/jobs/:id/score', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const job = await ownedJob(auth.profile.id, id);
    const resume = await prisma.resume.findFirst({
      where: { profileId: auth.profile.id, isMaster: true, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    const score = await scoreJobForProfile(auth.profile, job, resume);
    await audit({
      userId: auth.user.id,
      action: 'job.scored',
      entityType: 'job',
      entityId: job.id,
      metadata: { scoreId: score.id, overallScore: score.overallScore, model: score.model },
      ip: request.ip,
    });
    if (score.overallScore >= 90) {
      await notify({
        subject: `Strong match: ${job.title} at ${job.company}`,
        body: `Score ${score.overallScore}/100. ${score.reasoning}`,
        metadata: { jobId: job.id, scoreId: score.id, profileId: auth.profile.id },
      });
    }
    return { score };
  });

  app.post('/api/jobs/:id/tailor', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const job = await ownedJob(auth.profile.id, id);
    const resume = await prisma.resume.findFirst({
      where: { profileId: auth.profile.id, isMaster: true, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    if (!resume) throw new HttpError(400, 'Upload a master resume first');
    const tailored = await generateTailoredResume(auth.profile, resume, job);
    await audit({
      userId: auth.user.id,
      action: 'resume.generated',
      entityType: 'job',
      entityId: job.id,
      metadata: { tailoredResumeId: tailored.id, model: tailored.model },
      ip: request.ip,
    });
    return { tailoredResume: tailored };
  });

  app.post('/api/jobs/:id/cover-letter', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const job = await ownedJob(auth.profile.id, id);
    const resume = await prisma.resume.findFirst({
      where: { profileId: auth.profile.id, isMaster: true, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    if (!resume) throw new HttpError(400, 'Upload a master resume first');
    const score = await prisma.jobScore.findFirst({
      where: { jobId: job.id, profileId: auth.profile.id },
      orderBy: { createdAt: 'desc' },
    });
    const generated = await generateCoverLetter(auth.profile, resume, job, score);
    const coverLetter = await prisma.coverLetter.create({
      data: {
        jobId: job.id,
        profileId: auth.profile.id,
        content: generated.content,
        model: generated.model,
        promptVersion: generated.promptVersion,
      },
    });
    await audit({
      userId: auth.user.id,
      action: 'cover_letter.generated',
      entityType: 'job',
      entityId: job.id,
      metadata: { coverLetterId: coverLetter.id },
      ip: request.ip,
    });
    return { coverLetter };
  });

  app.post('/api/jobs/:id/prepare', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const job = await ownedJob(auth.profile.id, id);
    const input = z
      .object({ force: z.boolean().optional(), includeCoverLetter: z.boolean().optional() })
      .parse(request.body ?? {});
    const result = await prepareApplication(auth.profile, job, input);
    await audit({
      userId: auth.user.id,
      action: 'application.prepared',
      entityType: 'application',
      entityId: result.application.id,
      metadata: { jobId: job.id, warnings: result.warnings },
      ip: request.ip,
    });
    return result;
  });

  app.post('/api/jobs/:id/referrals', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const job = await ownedJob(auth.profile.id, id);
    const contacts = await rankContactsForJob(auth.profile.id, job);
    return {
      contacts,
      note:
        contacts.length === 0
          ? 'No contacts at this company yet. Add contacts manually or import a CSV — this system does not scrape LinkedIn.'
          : 'Ranked from contacts you supplied. Relationships are never inferred.',
    };
  });

  app.post('/api/jobs/:id/outreach', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z
      .object({
        contactId: z.string().uuid(),
        type: z.enum(MESSAGE_TYPES).optional(),
        applicationId: z.string().uuid().optional(),
        tone: z.string().max(200).optional(),
      })
      .parse(request.body);
    const job = await ownedJob(auth.profile.id, id);
    const contact = await prisma.contact.findFirst({
      where: { id: input.contactId, profileId: auth.profile.id, deletedAt: null },
    });
    if (!contact) throw new HttpError(404, 'Contact not found');
    const message = await generateOutreach({
      profile: auth.profile,
      contact,
      job,
      applicationId: input.applicationId,
      type:
        input.type ??
        (contact.category === 'RECRUITER'
          ? 'RECRUITER_OUTREACH'
          : contact.category === 'HIRING_MANAGER' || contact.category === 'ENGINEERING_MANAGER'
            ? 'HIRING_MANAGER_OUTREACH'
            : 'REFERRAL_REQUEST'),
      tone: input.tone,
    });
    await audit({
      userId: auth.user.id,
      action: 'message.generated',
      entityType: 'outreach',
      entityId: message.id,
      metadata: { contactId: contact.id, jobId: job.id, type: message.type },
      ip: request.ip,
    });
    return { message };
  });
}
