import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, type AiProviderKind } from '@vulcaestus/db';
import { providerConfigSchema } from '@vulcaestus/types';
import { env } from '../env.js';
import { requireAdmin, requireProfile } from '../auth.js';
import { HttpError, audit, jsonValue } from '../lib/http.js';
import { encryptSecret, maskSecret } from '../lib/crypto.js';
import { notify } from '../lib/notify.js';
import { listPrompts, loadPrompt, testProvider } from '../services/ai.js';
import { runSource } from '../services/jobs/sources.js';
import { ingestJobs } from '../services/jobs/ingest.js';

const SECRET_KEYS = /^(apiKey|api_key|token|secret|clientSecret|password)$/i;

function encryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (SECRET_KEYS.test(key) && typeof value === 'string' && value.length > 0) {
      result[key] = value.startsWith('v1:') ? value : encryptSecret(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = encryptConfig(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function maskConfig(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (SECRET_KEYS.test(key) && typeof value === 'string' && value.length > 0) {
      result[key] = '••••••';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = maskConfig(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function maskProviderKey(config: { apiKeyEncrypted: string | null; name: string }) {
  return maskSecret(config.apiKeyEncrypted);
}

const SETTING_KEYS = [
  'followupDays',
  'maxJobsPerDay',
  'maxFollowupsPerDay',
  'notificationsEnabled',
  'linkedinHandoffOnly',
  'aiEnabled',
  'defaultAutomationMode',
] as const;

async function readSettings(): Promise<Record<string, unknown>> {
  const rows = await prisma.setting.findMany();
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    followupDays: env.FOLLOWUP_DAYS,
    maxJobsPerDay: env.MAX_JOBS_PER_DAY,
    maxFollowupsPerDay: env.MAX_FOLLOWUPS_PER_DAY,
    notificationsEnabled: env.NOTIFICATIONS_ENABLED,
    linkedinHandoffOnly: true,
    aiEnabled: env.AI_ENABLED,
    defaultAutomationMode: 'SAFE_MODE',
    ...stored,
  };
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings', async (request) => {
    requireProfile(request);
    const settings = await readSettings();
    return {
      settings,
      runtime: {
        dryRun: env.DRY_RUN,
        aiEnabled: env.AI_ENABLED,
        aiProvider: env.AI_PROVIDER,
        ollamaModel: env.OLLAMA_MODEL,
        webUrl: env.WEB_URL,
        followupDays: env.FOLLOWUP_DAYS,
        linkedinHandoffOnly: true,
        version: '1.0.0',
      },
      integrations: {
        telegram: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
        email: Boolean(env.EMAIL_HOST && env.EMAIL_USER),
        browserWorker: env.BROWSER_WORKER_URL,
      },
    };
  });

  app.put('/api/settings', async (request) => {
    const auth = requireAdmin(request);
    const input = z
      .object({
        followupDays: z.number().int().min(1).max(90).optional(),
        maxJobsPerDay: z.number().int().min(1).max(2000).optional(),
        maxFollowupsPerDay: z.number().int().min(1).max(200).optional(),
        notificationsEnabled: z.boolean().optional(),
        linkedinHandoffOnly: z.literal(true).optional(),
        aiEnabled: z.boolean().optional(),
        defaultAutomationMode: z.enum(['SAFE_MODE', 'ASSISTED_MODE', 'AUTONOMOUS_MODE']).optional(),
      })
      .parse(request.body);
    for (const [key, value] of Object.entries(input)) {
      if (!SETTING_KEYS.includes(key as (typeof SETTING_KEYS)[number])) continue;
      await prisma.setting.upsert({
        where: { key },
        update: { value: jsonValue(value) },
        create: { key, value: jsonValue(value) },
      });
    }
    await audit({
      userId: auth.user.id,
      action: 'settings.updated',
      entityType: 'setting',
      metadata: { fields: Object.keys(input) },
      ip: request.ip,
    });
    return { settings: await readSettings() };
  });

  // ---------- Job sources ----------

  app.get('/api/sources', async (request) => {
    requireProfile(request);
    const sources = await prisma.jobSource.findMany({ orderBy: { createdAt: 'asc' } });
    return {
      sources: sources.map((source) => ({ ...source, config: maskConfig((source.config as Record<string, unknown>) ?? {}) })),
    };
  });

  app.post('/api/sources', async (request, reply) => {
    const auth = requireAdmin(request);
    const input = z
      .object({
        name: z.string().min(1).max(120),
        kind: z.enum([
          'MANUAL',
          'GREENHOUSE',
          'LEVER',
          'REMOTIVE',
          'RSS',
          'ASHBY',
          'WORKABLE',
          'SERPAPI_GOOGLE',
          'INDEED_PARTNER',
          'ZIPRECRUITER_PARTNER',
          'LINKEDIN_MANUAL',
        ]),
        enabled: z.boolean().default(true),
        config: z.record(z.unknown()).default({}),
        schedule: z.string().max(120).optional(),
      })
      .parse(request.body);
    const source = await prisma.jobSource.create({
      data: {
        name: input.name,
        kind: input.kind,
        enabled: input.enabled,
        config: jsonValue(encryptConfig(input.config)),
        schedule: input.schedule,
      },
    });
    await audit({
      userId: auth.user.id,
      action: 'source.created',
      entityType: 'jobSource',
      entityId: source.id,
      metadata: { kind: source.kind, name: source.name },
      ip: request.ip,
    });
    return reply.code(201).send({ source: { ...source, config: maskConfig(source.config as Record<string, unknown>) } });
  });

  app.post('/api/sources/defaults', async (request, reply) => {
    const auth = requireAdmin(request);
    const defaults = [
      { name: 'Remotive (remote jobs)', kind: 'REMOTIVE' as const, enabled: true, config: {} },
      { name: 'LinkedIn (manual import only)', kind: 'LINKEDIN_MANUAL' as const, enabled: false, config: {} },
    ];
    const created = [];
    for (const source of defaults) {
      const exists = await prisma.jobSource.findUnique({ where: { name: source.name } });
      if (exists) continue;
      created.push(
        await prisma.jobSource.create({
          data: { ...source, config: jsonValue(source.config) },
        }),
      );
    }
    await audit({
      userId: auth.user.id,
      action: 'sources.defaults_created',
      entityType: 'jobSource',
      metadata: { count: created.length },
      ip: request.ip,
    });
    return reply.code(201).send({ created: created.length, sources: created });
  });

  app.patch('/api/sources/:id', async (request) => {
    const auth = requireAdmin(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z
      .object({
        name: z.string().min(1).max(120).optional(),
        enabled: z.boolean().optional(),
        config: z.record(z.unknown()).optional(),
        schedule: z.string().max(120).nullable().optional(),
      })
      .parse(request.body);
    const existing = await prisma.jobSource.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'Source not found');

    let config = existing.config as Record<string, unknown>;
    if (input.config) {
      config = { ...config };
      for (const [key, value] of Object.entries(input.config)) {
        if (SECRET_KEYS.test(key) && (value === '' || value === '••••••')) continue;
        config[key] = SECRET_KEYS.test(key) && typeof value === 'string' ? encryptSecret(value) : value;
      }
    }
    const source = await prisma.jobSource.update({
      where: { id },
      data: {
        name: input.name,
        enabled: input.enabled,
        schedule: input.schedule,
        config: jsonValue(config),
        lastError: null,
      },
    });
    return { source: { ...source, config: maskConfig(source.config as Record<string, unknown>) } };
  });

  app.delete('/api/sources/:id', async (request) => {
    const auth = requireAdmin(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await prisma.jobSource.delete({ where: { id } }).catch(() => {
      throw new HttpError(404, 'Source not found');
    });
    await audit({
      userId: auth.user.id,
      action: 'source.deleted',
      entityType: 'jobSource',
      entityId: id,
      ip: request.ip,
    });
    return { ok: true };
  });

  app.post('/api/sources/:id/run', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const source = await prisma.jobSource.findUnique({ where: { id } });
    if (!source) throw new HttpError(404, 'Source not found');
    try {
      const { jobs, note } = await runSource(source);
      const result = await ingestJobs(jobs, {
        sourceId: source.id,
        profileId: auth.profile.id,
        limit: env.MAX_JOBS_PER_DAY,
      });
      await prisma.jobSource.update({
        where: { id },
        data: { lastRunAt: new Date(), lastError: null },
      });
      await audit({
        userId: auth.user.id,
        action: 'source.run',
        entityType: 'jobSource',
        entityId: id,
        metadata: { created: result.created, duplicates: result.duplicates, note },
        ip: request.ip,
      });
      return { ...result, note };
    } catch (error) {
      await prisma.jobSource.update({
        where: { id },
        data: { lastRunAt: new Date(), lastError: (error as Error).message.slice(0, 2000) },
      });
      throw new HttpError(502, `Source failed: ${(error as Error).message}`);
    }
  });

  // ---------- AI providers ----------

  app.get('/api/providers', async (request) => {
    requireAdmin(request);
    const providers = await prisma.aiProviderConfig.findMany({ orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    return {
      providers: providers.map((provider) => ({
        ...provider,
        apiKeyEncrypted: undefined,
        hasApiKey: Boolean(provider.apiKeyEncrypted),
        maskedKey: maskProviderKey({ apiKeyEncrypted: provider.apiKeyEncrypted, name: provider.name }),
      })),
      defaults: { provider: env.AI_PROVIDER, model: env.OLLAMA_MODEL, baseUrl: env.OLLAMA_BASE_URL },
    };
  });

  app.post('/api/providers', async (request, reply) => {
    const auth = requireAdmin(request);
    const input = providerConfigSchema.parse(request.body);
    const existing = await prisma.aiProviderConfig.findUnique({ where: { name: input.name } });
    if (existing) throw new HttpError(409, 'A provider with that name already exists');
    const provider = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.aiProviderConfig.updateMany({ data: { isDefault: false } });
      }
      return tx.aiProviderConfig.create({
        data: {
          name: input.name,
          provider: input.provider,
          baseUrl: input.baseUrl || null,
          model: input.model,
          apiKeyEncrypted: input.apiKey ? encryptSecret(input.apiKey) : null,
          enabled: input.enabled,
          isDefault: input.isDefault,
          settings: jsonValue(input.settings ?? {}),
        },
      });
    });
    await audit({
      userId: auth.user.id,
      action: 'provider.created',
      entityType: 'aiProvider',
      entityId: provider.id,
      metadata: { name: provider.name, kind: provider.provider, model: provider.model },
      ip: request.ip,
    });
    return reply.code(201).send({
      provider: { ...provider, apiKeyEncrypted: undefined, hasApiKey: Boolean(provider.apiKeyEncrypted) },
    });
  });

  app.patch('/api/providers/:id', async (request) => {
    const auth = requireAdmin(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = providerConfigSchema.partial().extend({ apiKey: z.string().max(500).nullable().optional() }).parse(request.body);
    const existing = await prisma.aiProviderConfig.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'Provider not found');
    const provider = await prisma.$transaction(async (tx) => {
      if (input.isDefault === true) {
        await tx.aiProviderConfig.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      }
      return tx.aiProviderConfig.update({
        where: { id },
        data: {
          name: input.name,
          provider: input.provider,
          baseUrl: input.baseUrl === '' ? null : input.baseUrl,
          model: input.model,
          enabled: input.enabled,
          isDefault: input.isDefault,
          settings: input.settings ? jsonValue(input.settings) : undefined,
          ...(input.apiKey !== undefined
            ? { apiKeyEncrypted: input.apiKey ? encryptSecret(input.apiKey) : null }
            : {}),
        },
      });
    });
    await audit({
      userId: auth.user.id,
      action: 'provider.updated',
      entityType: 'aiProvider',
      entityId: provider.id,
      metadata: { fields: Object.keys(input) },
      ip: request.ip,
    });
    return {
      provider: { ...provider, apiKeyEncrypted: undefined, hasApiKey: Boolean(provider.apiKeyEncrypted) },
    };
  });

  app.delete('/api/providers/:id', async (request) => {
    const auth = requireAdmin(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await prisma.aiProviderConfig.delete({ where: { id } }).catch(() => {
      throw new HttpError(404, 'Provider not found');
    });
    await audit({
      userId: auth.user.id,
      action: 'provider.deleted',
      entityType: 'aiProvider',
      entityId: id,
      ip: request.ip,
    });
    return { ok: true };
  });

  app.post('/api/providers/:id/test', async (request) => {
    const auth = requireAdmin(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const provider = await prisma.aiProviderConfig.findUnique({ where: { id } });
    if (!provider) throw new HttpError(404, 'Provider not found');
    const result = await testProvider({
      provider: provider.provider as AiProviderKind,
      model: provider.model,
      baseUrl: provider.baseUrl,
      apiKeyEncrypted: provider.apiKeyEncrypted,
    });
    await prisma.aiProviderConfig.update({
      where: { id },
      data: {
        lastTestedAt: new Date(),
        lastTestOk: result.ok,
        lastTestError: result.ok ? null : result.message.slice(0, 2000),
      },
    });
    return result;
  });

  // ---------- Prompts ----------

  app.get('/api/prompts', async (request) => {
    requireAdmin(request);
    return { prompts: await listPrompts() };
  });

  app.get('/api/prompts/:name', async (request) => {
    requireAdmin(request);
    const { name } = z.object({ name: z.string().min(1).max(120) }).parse(request.params);
    return { prompt: await loadPrompt(name) };
  });

  app.put('/api/prompts/:name', async (request) => {
    const auth = requireAdmin(request);
    const { name } = z.object({ name: z.string().min(1).max(120) }).parse(request.params);
    const input = z
      .object({ content: z.string().min(20).max(100_000), version: z.string().min(1).max(40) })
      .parse(request.body);
    const prompt = await prisma.prompt.upsert({
      where: { name },
      update: { content: input.content, version: input.version },
      create: { name, content: input.content, version: input.version },
    });
    await audit({
      userId: auth.user.id,
      action: 'prompt.updated',
      entityType: 'prompt',
      metadata: { name, version: input.version },
      ip: request.ip,
    });
    return { prompt: { ...prompt, source: 'database' } };
  });

  app.delete('/api/prompts/:name', async (request) => {
    const auth = requireAdmin(request);
    const { name } = z.object({ name: z.string().min(1).max(120) }).parse(request.params);
    await prisma.prompt.deleteMany({ where: { name } });
    await audit({
      userId: auth.user.id,
      action: 'prompt.reset_to_file',
      entityType: 'prompt',
      metadata: { name },
      ip: request.ip,
    });
    return { ok: true };
  });

  // ---------- Notifications ----------

  app.get('/api/notifications', async (request) => {
    const auth = requireProfile(request);
    const notifications = await prisma.notification.findMany({
      where: {
        metadata: { path: ['profileId'], equals: auth.profile.id },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { notifications };
  });

  app.post('/api/settings/notifications/test', async (request) => {
    const auth = requireProfile(request);
    await notify({
      subject: 'Vulcaestus test notification',
      body: 'Notifications are configured. This message was sent from the settings page.',
      metadata: { test: true, profileId: auth.profile.id },
    });
    return { ok: true };
  });
}
