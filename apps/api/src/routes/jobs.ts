import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, type Prisma } from '@vulcaestus/db';
import {
  jobInputSchema,
  recommendationFor,
} from '@vulcaestus/types';
import { env } from '../env.js';
import { requireAuth, requireProfile } from '../auth.js';
import { HttpError, asString, audit, getPagination, jsonValue } from '../lib/http.js';
import { checkLimit } from '../lib/limits.js';
import { notify } from '../lib/notify.js';
import { ingestJob, ingestJobs } from '../services/jobs/ingest.js';
import { runSource } from '../services/jobs/sources.js';
import { scoreJobForProfile } from '../services/jobs/score.js';
import { generateCoverLetter, generateTailoredResume } from '../services/tailoring.js';
import { prepareApplication } from '../services/applications.js';
import { rankContactsForJob } from '../services/referrals.js';
import { generateOutreach } from '../services/outreach.js';
import { MESSAGE_TYPES } from '@vulcaestus/types';

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

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/jobs', async (request) => {
    const auth = requireProfile(request);
    const query = request.query as Record<string, unknown>;
    const { page, pageSize, skip, take } = getPagination(query);
    const search = asString(query.q);
    const company = asString(query.company);
    const source = asString(query.source);
    const remoteType = asString(query.remoteType);
    const minScore = query.minScore ? Number(query.minScore) : undefined;
    const recommendation = asString(query.recommendation);
    const hasApplication = query.hasApplication;
    const sort = asString(query.sort) ?? 'newest';

    const where: Prisma.JobWhereInput = {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { company: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(company ? { companyNormalized: { contains: company.toLowerCase() } } : {}),
      ...(source ? { source } : {}),
      ...(remoteType ? { remoteType: remoteType as 'REMOTE' } : {}),
      ...(hasApplication === 'true'
        ? { applications: { some: { profileId: auth.profile.id, deletedAt: null } } }
        : hasApplication === 'false'
          ? { applications: { none: { profileId: auth.profile.id, deletedAt: null } } }
          : {}),
    };

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

    if (minScore !== undefined || recommendation) {
      const jobs = await prisma.job.findMany({
        where,
        include,
        orderBy: sort === 'score' ? { updatedAt: 'desc' } : { discoveredAt: 'desc' },
        take: 500,
      });
      const filtered = jobs
        .filter((job) => {
          const score = job.scores[0];
          if (minScore !== undefined && (!score || score.overallScore < minScore)) return false;
          if (recommendation && score?.recommendation !== recommendation) return false;
          return true;
        })
        .sort((a, b) =>
          sort === 'score'
            ? (b.scores[0]?.overallScore ?? 0) - (a.scores[0]?.overallScore ?? 0)
            : b.discoveredAt.getTime() - a.discoveredAt.getTime(),
        );
      const items = filtered.slice(skip, skip + take);
      return {
        jobs: items,
        total: filtered.length,
        page,
        pageSize,
        scores: Object.fromEntries(items.map((job) => [job.id, job.scores[0] ?? null])),
        applications: Object.fromEntries(items.map((job) => [job.id, job.applications[0] ?? null])),
      };
    }

    const [total, jobs] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({
        where,
        include,
        orderBy: sort === 'score' ? { updatedAt: 'desc' } : { discoveredAt: 'desc' },
        skip,
        take,
      }),
    ]);
    return {
      jobs,
      total,
      page,
      pageSize,
      scores: Object.fromEntries(jobs.map((job) => [job.id, job.scores[0] ?? null])),
      applications: Object.fromEntries(jobs.map((job) => [job.id, job.applications[0] ?? null])),
    };
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
        metadata: { created },
      });
    }
    return { results, created };
  });

  app.get('/api/jobs/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const job = await prisma.job.findFirst({
      where: { id, deletedAt: null },
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
    return { job, application: application ?? null, approvals };
  });

  app.patch('/api/jobs/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = jobPatchSchema.parse(request.body);
    const existing = await prisma.job.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new HttpError(404, 'Job not found');
    const job = await prisma.job.update({
      where: { id },
      data: input,
    });
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

  app.delete('/api/jobs/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await prisma.job.update({ where: { id }, data: { deletedAt: new Date() } }).catch(() => {
      throw new HttpError(404, 'Job not found');
    });
    await audit({ userId: auth.user.id, action: 'job.archived', entityType: 'job', entityId: id, ip: request.ip });
    return { ok: true };
  });

  app.post('/api/jobs/:id/score', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const job = await prisma.job.findFirst({ where: { id, deletedAt: null } });
    if (!job) throw new HttpError(404, 'Job not found');
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
        metadata: { jobId: job.id, scoreId: score.id },
      });
    }
    return { score };
  });

  app.post('/api/jobs/:id/tailor', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const job = await prisma.job.findFirst({ where: { id, deletedAt: null } });
    if (!job) throw new HttpError(404, 'Job not found');
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
    const job = await prisma.job.findFirst({ where: { id, deletedAt: null } });
    if (!job) throw new HttpError(404, 'Job not found');
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
    const job = await prisma.job.findFirst({ where: { id, deletedAt: null } });
    if (!job) throw new HttpError(404, 'Job not found');
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
    const job = await prisma.job.findFirst({ where: { id, deletedAt: null } });
    if (!job) throw new HttpError(404, 'Job not found');
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
    const job = await prisma.job.findFirst({ where: { id, deletedAt: null } });
    if (!job) throw new HttpError(404, 'Job not found');
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
