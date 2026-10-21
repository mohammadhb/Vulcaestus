import type { FastifyInstance } from 'fastify';
import { prisma } from '@vulcaestus/db';
import { requireProfile } from '../auth.js';
import { analyticsSummary } from '../services/analytics.js';
import { dailySummary } from '../lib/limits.js';

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/analytics/summary', async (request) => {
    const auth = requireProfile(request);
    const [summary, today] = await Promise.all([
      analyticsSummary(auth.profile.id),
      dailySummary(auth.profile.id),
    ]);
    return { ...summary, today };
  });

  app.get('/api/analytics/activity', async (request) => {
    const auth = requireProfile(request);
    const query = request.query as Record<string, unknown>;
    const limit = Math.min(200, Math.max(1, Number(query.limit ?? 50) || 50));
    const logs = await prisma.auditLog.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return {
      activity: logs.map((log) => ({ ...log, metadata: log.metadata as Record<string, unknown> })),
    };
  });

  app.get('/api/analytics/sources', async (request) => {
    const auth = requireProfile(request);
    const applications = await prisma.application.findMany({
      where: { profileId: auth.profile.id, deletedAt: null },
      include: { job: { select: { source: true } } },
    });
    const bySource = new Map<string, { applications: number; submitted: number; interviews: number; offers: number }>();
    for (const application of applications) {
      const entry = bySource.get(application.job.source) ?? {
        applications: 0,
        submitted: 0,
        interviews: 0,
        offers: 0,
      };
      entry.applications += 1;
      if (application.submittedAt) entry.submitted += 1;
      if (['INTERVIEW', 'FINAL_ROUND', 'OFFER'].includes(application.status)) entry.interviews += 1;
      if (application.status === 'OFFER') entry.offers += 1;
      bySource.set(application.job.source, entry);
    }
    return {
      sources: [...bySource.entries()].map(([source, stats]) => ({ source, ...stats })),
    };
  });
}
