import { prisma, type BatchRun } from '@vulcaestus/db';
import { HttpError, jsonValue } from '../../lib/http.js';
import { findJobIds, type JobFilters } from './query.js';
import { scoreJobForProfile } from './score.js';

export type ScoreScope = 'unscored' | 'filtered' | 'selected';

export interface StartScoreBatchInput {
  profileId: string;
  scope: ScoreScope;
  jobIds?: string[];
  filters?: JobFilters;
  useAi: boolean;
  limit?: number;
}

const activeProfiles = new Set<string>();
const cancelledRuns = new Set<string>();
const MAX_BATCH = 500;

async function resolveJobIds(input: StartScoreBatchInput): Promise<string[]> {
  const limit = Math.min(input.limit ?? MAX_BATCH, MAX_BATCH);
  if (input.scope === 'selected') {
    if (!input.jobIds?.length) throw new HttpError(400, 'Select at least one job to score');
    const jobs = await prisma.job.findMany({
      where: {
        profileId: input.profileId,
        id: { in: input.jobIds.slice(0, limit) },
        deletedAt: null,
      },
      select: { id: true },
    });
    return jobs.map((job) => job.id);
  }
  if (input.scope === 'unscored') {
    const jobs = await prisma.job.findMany({
      where: {
        profileId: input.profileId,
        deletedAt: null,
        archivedAt: null,
        scores: { none: { profileId: input.profileId } },
      },
      select: { id: true },
      orderBy: { discoveredAt: 'desc' },
      take: limit,
    });
    return jobs.map((job) => job.id);
  }
  if (!input.filters) throw new HttpError(400, 'Filters are required for filtered scoring');
  return findJobIds(input.profileId, input.filters, 'all', limit);
}

async function executeBatch(runId: string): Promise<void> {
  const run = await prisma.batchRun.findUnique({ where: { id: runId }, include: { profile: true } });
  if (!run) return;
  const request = (run.request as Record<string, unknown>) ?? {};
  const jobIds = Array.isArray(request.jobIds) ? (request.jobIds as string[]) : [];
  const useAi = request.useAi !== false;
  const profile = run.profile;

  await prisma.batchRun.update({
    where: { id: runId },
    data: { status: 'RUNNING', startedAt: new Date(), error: null },
  });

  const resume = await prisma.resume.findFirst({
    where: { profileId: profile.id, isMaster: true, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
  });

  let processed = 0;
  let failed = 0;
  let firstError: string | null = null;
  let cancelled = false;

  for (const jobId of jobIds) {
    if (cancelledRuns.has(runId)) {
      cancelled = true;
      break;
    }
    try {
      const job = await prisma.job.findFirst({
        where: { id: jobId, profileId: profile.id, deletedAt: null },
      });
      if (!job) {
        failed += 1;
        continue;
      }
      await scoreJobForProfile(profile, job, resume, { useAi });
    } catch (error) {
      failed += 1;
      firstError ??= (error as Error).message.slice(0, 1000);
    } finally {
      processed += 1;
      await prisma.batchRun.update({
        where: { id: runId },
        data: { processed, failed },
      });
    }
  }

  cancelledRuns.delete(runId);
  await prisma.batchRun.update({
    where: { id: runId },
    data: {
      status: cancelled ? 'CANCELLED' : 'COMPLETED',
      processed,
      failed,
      finishedAt: new Date(),
      error: firstError,
    },
  });
}

export async function startScoreBatch(input: StartScoreBatchInput): Promise<BatchRun> {
  if (activeProfiles.has(input.profileId)) {
    throw new HttpError(409, 'A scoring run is already active for your profile. Wait for it to finish or cancel it.');
  }

  // Mark orphaned runs from a restart as interrupted before starting a new one.
  await prisma.batchRun.updateMany({
    where: { profileId: input.profileId, status: { in: ['QUEUED', 'RUNNING'] } },
    data: {
      status: 'INTERRUPTED',
      finishedAt: new Date(),
      error: 'Interrupted before completion (API restarted or a new run started).',
    },
  });

  const jobIds = await resolveJobIds(input);
  if (jobIds.length === 0) {
    throw new HttpError(400, 'No jobs match this scoring scope.');
  }

  const run = await prisma.batchRun.create({
    data: {
      profileId: input.profileId,
      kind: 'SCORE',
      status: 'QUEUED',
      total: jobIds.length,
      request: jsonValue({
        scope: input.scope,
        jobIds,
        useAi: input.useAi,
        ...(input.filters ? { filters: input.filters } : {}),
      }),
    },
  });

  activeProfiles.add(input.profileId);
  void executeBatch(run.id)
    .catch(async (error) => {
      await prisma.batchRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          error: (error as Error).message.slice(0, 2000),
          finishedAt: new Date(),
        },
      });
    })
    .finally(() => {
      activeProfiles.delete(input.profileId);
      cancelledRuns.delete(run.id);
    });

  return run;
}

export async function getBatchRun(profileId: string, runId: string): Promise<BatchRun> {
  const run = await prisma.batchRun.findFirst({ where: { id: runId, profileId } });
  if (!run) throw new HttpError(404, 'Scoring run not found');
  return run;
}

export async function cancelBatchRun(profileId: string, runId: string): Promise<BatchRun> {
  const run = await prisma.batchRun.findFirst({ where: { id: runId, profileId } });
  if (!run) throw new HttpError(404, 'Scoring run not found');
  if (!['QUEUED', 'RUNNING'].includes(run.status)) return run;
  cancelledRuns.add(runId);
  return prisma.batchRun.update({
    where: { id: runId },
    data: { status: 'CANCELLED', finishedAt: new Date() },
  });
}

export async function latestBatchRun(profileId: string): Promise<BatchRun | null> {
  const run = await prisma.batchRun.findFirst({
    where: { profileId, kind: 'SCORE' },
    orderBy: { createdAt: 'desc' },
  });
  if (run && ['QUEUED', 'RUNNING'].includes(run.status) && !activeProfiles.has(profileId)) {
    return prisma.batchRun.update({
      where: { id: run.id },
      data: {
        status: 'INTERRUPTED',
        finishedAt: new Date(),
        error: 'Interrupted by an API restart.',
      },
    });
  }
  return run;
}
