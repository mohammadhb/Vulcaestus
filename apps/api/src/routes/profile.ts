import type { FastifyInstance } from 'fastify';
import { prisma } from '@vulcaestus/db';
import { profileInputSchema } from '@vulcaestus/types';
import { requireAuth, requireProfile } from '../auth.js';
import { audit } from '../lib/http.js';

function nullable(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value.trim() === '' ? null : value.trim();
}

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/profile', async (request) => {
    const auth = requireAuth(request);
    return { profile: auth.profile };
  });

  app.put('/api/profile', async (request) => {
    const auth = requireAuth(request);
    const input = profileInputSchema.partial().parse(request.body);
    const data = {
      ...input,
      linkedinUrl: nullable(input.linkedinUrl),
      githubUrl: nullable(input.githubUrl),
      portfolioUrl: nullable(input.portfolioUrl),
      phone: nullable(input.phone),
      location: nullable(input.location),
      country: nullable(input.country),
      headline: nullable(input.headline),
      summary: nullable(input.summary),
      workAuthorization: nullable(input.workAuthorization),
      relocationPreference: nullable(input.relocationPreference),
      email: input.email?.toLowerCase().trim(),
    };

    const { fullName, email, ...rest } = input;
    const profile = await prisma.candidateProfile.upsert({
      where: { userId: auth.user.id },
      update: data,
      create: {
        userId: auth.user.id,
        fullName: fullName ?? auth.user.name ?? auth.user.email.split('@')[0]!,
        email: (email ?? auth.user.email).toLowerCase().trim(),
        ...rest,
        linkedinUrl: nullable(input.linkedinUrl),
        githubUrl: nullable(input.githubUrl),
        portfolioUrl: nullable(input.portfolioUrl),
        phone: nullable(input.phone),
        location: nullable(input.location),
        country: nullable(input.country),
        headline: nullable(input.headline),
        summary: nullable(input.summary),
        workAuthorization: nullable(input.workAuthorization),
        relocationPreference: nullable(input.relocationPreference),
      },
    });
    await audit({
      userId: auth.user.id,
      action: 'profile.updated',
      entityType: 'profile',
      entityId: profile.id,
      metadata: { fields: Object.keys(input) },
      ip: request.ip,
    });
    return { profile };
  });

  app.get('/api/profile/daily-limits', async (request) => {
    const auth = requireProfile(request);
    const { dailySummary } = await import('../lib/limits.js');
    return {
      usage: await dailySummary(auth.profile.id),
      limits: {
        applications: auth.profile.dailyApplicationLimit,
        outreach: auth.profile.dailyOutreachLimit,
        automationMode: auth.profile.automationMode,
        dryRun: (await import('../env.js')).env.DRY_RUN,
      },
    };
  });
}
