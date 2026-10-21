import { Prisma, prisma, type Job } from '@vulcaestus/db';
import type { JobInput } from '@vulcaestus/types';
import { env } from '../../env.js';
import { jsonValue } from '../../lib/http.js';
import { normalizeJobInput, type NormalizedJob } from './normalize.js';
import { findDuplicate, type DuplicateCandidate } from './dedupe.js';

export interface IngestResult {
  job: Job;
  created: boolean;
  duplicateReason?: string;
  duplicateOf?: string;
}

function toCreateData(
  normalized: NormalizedJob,
  sourceId: string | null,
  raw: unknown,
  profileId: string,
) {
  return {
    profileId,
    sourceId,
    source: normalized.source,
    externalId: normalized.externalId,
    canonicalUrl: normalized.canonicalUrl,
    url: normalized.url,
    title: normalized.title,
    company: normalized.company,
    companyNormalized: normalized.companyNormalized,
    location: normalized.location,
    country: normalized.country,
    remoteType: normalized.remoteType,
    employmentType: normalized.employmentType,
    seniority: normalized.seniority,
    salaryMin: normalized.salaryMin,
    salaryMax: normalized.salaryMax,
    currency: normalized.currency,
    description: normalized.description,
    requirements: normalized.requirements,
    responsibilities: normalized.responsibilities,
    requiredSkills: normalized.requiredSkills,
    preferredSkills: normalized.preferredSkills,
    yearsExperience: normalized.yearsExperience,
    educationRequirement: normalized.educationRequirement,
    languageRequirements: normalized.languageRequirements,
    visaSponsorship: normalized.visaSponsorship,
    industry: normalized.industry,
    postedAt: normalized.postedAt,
    fingerprint: normalized.fingerprint,
    raw: jsonValue(raw),
  };
}

async function enrichExisting(existing: Job, normalized: NormalizedJob, raw: unknown): Promise<Job> {
  const data: Prisma.JobUpdateInput = {};
  if (!existing.url && normalized.url) data.url = normalized.url;
  if ((!existing.canonicalUrl || existing.canonicalUrl.length === 0) && normalized.canonicalUrl) {
    data.canonicalUrl = normalized.canonicalUrl;
  }
  if (normalized.description.length > existing.description.length + 200) {
    data.description = normalized.description;
  }
  if (existing.requirements.length === 0 && normalized.requirements.length > 0) {
    data.requirements = normalized.requirements;
  }
  if (existing.requiredSkills.length === 0 && normalized.requiredSkills.length > 0) {
    data.requiredSkills = normalized.requiredSkills;
  }
  if (existing.salaryMin === null && normalized.salaryMin !== null) data.salaryMin = normalized.salaryMin;
  if (existing.salaryMax === null && normalized.salaryMax !== null) data.salaryMax = normalized.salaryMax;
  if (existing.visaSponsorship === null && normalized.visaSponsorship !== null) {
    data.visaSponsorship = normalized.visaSponsorship;
  }
  if (existing.remoteType === 'UNKNOWN' && normalized.remoteType !== 'UNKNOWN') {
    data.remoteType = normalized.remoteType;
  }
  if (existing.seniority === 'UNKNOWN' && normalized.seniority !== 'UNKNOWN') {
    data.seniority = normalized.seniority;
  }
  if (Object.keys(data).length > 0) {
    return prisma.job.update({ where: { id: existing.id }, data });
  }
  return existing;
}

export async function ingestJob(
  input: JobInput,
  options: { sourceId?: string | null; raw?: unknown; profileId: string },
): Promise<IngestResult> {
  const normalized = normalizeJobInput(input);
  const sourceId = options.sourceId ?? null;
  const profileId = options.profileId;

  if (normalized.externalId) {
    const existing = await prisma.job.findFirst({
      where: {
        profileId,
        source: normalized.source,
        externalId: normalized.externalId,
      },
    });
    if (existing) {
      return {
        job: await enrichExisting(existing, normalized, options.raw),
        created: false,
        duplicateReason: 'external_id',
        duplicateOf: existing.id,
      };
    }
  }

  if (normalized.canonicalUrl) {
    const existing = await prisma.job.findFirst({
      where: { profileId, canonicalUrl: normalized.canonicalUrl },
    });
    if (existing) {
      return {
        job: await enrichExisting(existing, normalized, options.raw),
        created: false,
        duplicateReason: 'canonical_url',
        duplicateOf: existing.id,
      };
    }
  }

  const fingerprintMatch = await prisma.job.findFirst({
    where: { profileId, fingerprint: normalized.fingerprint },
  });
  if (fingerprintMatch) {
    return {
      job: await enrichExisting(fingerprintMatch, normalized, options.raw),
      created: false,
      duplicateReason: 'fingerprint',
      duplicateOf: fingerprintMatch.id,
    };
  }

  if (normalized.companyNormalized) {
    const recent = await prisma.job.findMany({
      where: {
        profileId,
        companyNormalized: normalized.companyNormalized,
        deletedAt: null,
        discoveredAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 180) },
      },
      take: 200,
      select: {
        id: true,
        source: true,
        externalId: true,
        canonicalUrl: true,
        fingerprint: true,
        companyNormalized: true,
        title: true,
        location: true,
      },
    });
    const match = findDuplicate(
      {
        source: normalized.source,
        externalId: normalized.externalId,
        canonicalUrl: normalized.canonicalUrl,
        fingerprint: normalized.fingerprint,
        companyNormalized: normalized.companyNormalized,
        title: normalized.title,
        location: normalized.location,
      },
      recent as DuplicateCandidate[],
    );
    if (match) {
      const existing = await prisma.job.findUnique({ where: { id: match.id } });
      if (existing) {
        return {
          job: await enrichExisting(existing, normalized, options.raw),
          created: false,
          duplicateReason: match.reason,
          duplicateOf: existing.id,
        };
      }
    }
  }

  try {
    const job = await prisma.job.create({
      data: toCreateData(normalized, sourceId, options.raw ?? input, profileId),
    });
    const date = new Date(new Date().toISOString().slice(0, 10));
    await prisma.dailyCounter.upsert({
      where: { profileId_date: { profileId, date } },
      update: { jobsDiscovered: { increment: 1 } },
      create: { profileId, date, jobsDiscovered: 1 },
    });
    return { job, created: true };
  } catch (error) {
    // A concurrent discovery run may have inserted the same job first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.job.findFirst({
        where: {
          profileId,
          OR: [
            { fingerprint: normalized.fingerprint },
            ...(normalized.canonicalUrl ? [{ canonicalUrl: normalized.canonicalUrl }] : []),
          ],
        },
      });
      if (existing) {
        return { job: existing, created: false, duplicateReason: 'concurrent_duplicate', duplicateOf: existing.id };
      }
    }
    throw error;
  }
}

export async function ingestJobs(
  inputs: JobInput[],
  options: { sourceId?: string | null; profileId: string; limit?: number },
): Promise<{ created: number; duplicates: number; errors: number; jobs: Job[] }> {
  const limit = options.limit ?? env.MAX_JOBS_PER_DAY;
  let created = 0;
  let duplicates = 0;
  let errors = 0;
  const jobs: Job[] = [];

  for (const input of inputs.slice(0, limit)) {
    try {
      const result = await ingestJob(input, options);
      jobs.push(result.job);
      if (result.created) created += 1;
      else duplicates += 1;
    } catch (error) {
      errors += 1;
      // eslint-disable-next-line no-console
      console.error('job ingest failed', (error as Error).message);
    }
  }

  return { created, duplicates, errors, jobs };
}
