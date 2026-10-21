import { prisma, type Prisma } from '@vulcaestus/db';
import { asString } from '../../lib/http.js';

export type JobView = 'active' | 'archived' | 'deleted';

export interface JobFilters {
  q?: string;
  company?: string;
  source?: string;
  remoteType?: string;
  recommendation?: string;
  minScore?: number;
  hasApplication?: string;
  view: JobView;
  sort: 'newest' | 'score';
}

export function parseJobFilters(query: Record<string, unknown>): JobFilters {
  const view = asString(query.view);
  return {
    q: asString(query.q),
    company: asString(query.company),
    source: asString(query.source),
    remoteType: asString(query.remoteType),
    recommendation: asString(query.recommendation),
    minScore: query.minScore !== undefined && query.minScore !== '' ? Number(query.minScore) : undefined,
    hasApplication: asString(query.hasApplication),
    view: view === 'archived' || view === 'deleted' ? view : 'active',
    sort: query.sort === 'score' ? 'score' : 'newest',
  };
}

export function buildJobWhere(profileId: string, filters: JobFilters): Prisma.JobWhereInput {
  return {
    profileId,
    ...(filters.view === 'active'
      ? { deletedAt: null, archivedAt: null }
      : filters.view === 'archived'
        ? { deletedAt: null, archivedAt: { not: null } }
        : { deletedAt: { not: null } }),
    ...(filters.q
      ? {
          OR: [
            { title: { contains: filters.q, mode: 'insensitive' } },
            { company: { contains: filters.q, mode: 'insensitive' } },
            { description: { contains: filters.q, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(filters.company ? { companyNormalized: { contains: filters.company.toLowerCase() } } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.remoteType ? { remoteType: filters.remoteType as 'REMOTE' } : {}),
    ...(filters.hasApplication === 'true'
      ? { applications: { some: { profileId, deletedAt: null } } }
      : filters.hasApplication === 'false'
        ? { applications: { none: { profileId, deletedAt: null } } }
        : {}),
  };
}

export function scoreFilterActive(filters: JobFilters): boolean {
  return filters.minScore !== undefined || Boolean(filters.recommendation);
}

type ScoredJob = {
  scores: Array<{ overallScore: number; recommendation: string }>;
};

export function matchesScoreFilters<T extends ScoredJob>(job: T, filters: JobFilters): boolean {
  const score = job.scores[0];
  if (filters.minScore !== undefined && (!score || score.overallScore < filters.minScore)) return false;
  if (filters.recommendation && score?.recommendation !== filters.recommendation) return false;
  return true;
}

export type QuickSelect = 'unscored' | 'strong' | 'apply' | 'no_application' | 'all';

export async function findJobIds(
  profileId: string,
  filters: JobFilters,
  quick: QuickSelect,
  limit = 1000,
): Promise<string[]> {
  const where = buildJobWhere(profileId, filters);
  if (quick === 'unscored') {
    const jobs = await prisma.job.findMany({
      where: { ...where, scores: { none: { profileId } } },
      select: { id: true },
      orderBy: { discoveredAt: 'desc' },
      take: limit,
    });
    return jobs.map((job) => job.id);
  }

  const jobs = await prisma.job.findMany({
    where,
    select: {
      id: true,
      discoveredAt: true,
      scores: {
        where: { profileId },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      applications: {
        where: { profileId, deletedAt: null },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: filters.sort === 'score' ? { updatedAt: 'desc' } : { discoveredAt: 'desc' },
    take: limit * 2,
  });

  const selected = jobs.filter((job) => {
    if (scoreFilterActive(filters) && !matchesScoreFilters(job, filters)) return false;
    if (quick === 'strong') return (job.scores[0]?.overallScore ?? 0) >= 90;
    if (quick === 'apply') {
      const score = job.scores[0]?.overallScore ?? 0;
      return score >= 80 && score < 90;
    }
    if (quick === 'no_application') return job.applications.length === 0;
    return true;
  });

  return selected
    .sort((a, b) =>
      filters.sort === 'score'
        ? (b.scores[0]?.overallScore ?? 0) - (a.scores[0]?.overallScore ?? 0)
        : b.discoveredAt.getTime() - a.discoveredAt.getTime(),
    )
    .slice(0, limit)
    .map((job) => job.id);
}
