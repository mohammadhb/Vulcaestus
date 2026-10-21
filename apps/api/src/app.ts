import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { Prisma, prisma } from '@vulcaestus/db';
import { env } from './env.js';
import { loadSession, isPublicPath } from './auth.js';
import { HttpError } from './lib/http.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { profileRoutes } from './routes/profile.js';
import { resumeRoutes } from './routes/resumes.js';
import { jobRoutes } from './routes/jobs.js';
import { applicationRoutes } from './routes/applications.js';
import { approvalRoutes } from './routes/approvals.js';
import { contactRoutes } from './routes/contacts.js';
import { outreachRoutes } from './routes/outreach.js';
import { interviewRoutes } from './routes/interviews.js';
import { followUpRoutes } from './routes/followups.js';
import { analyticsRoutes } from './routes/analytics.js';
import { settingsRoutes } from './routes/settings.js';
import { webhookRoutes } from './routes/webhooks.js';
import { internalRoutes } from './routes/internal.js';
import { documentRoutes } from './routes/documents.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-api-key"]',
          'req.headers["x-webhook-secret"]',
          'req.headers["x-worker-secret"]',
          'res.headers["set-cookie"]',
        ],
        censor: '[redacted]',
      },
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } } }
        : {}),
    },
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: env.TRUST_PROXY,
    requestTimeout: 120_000,
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: [env.WEB_URL, env.API_URL],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(helmet, {
    crossOriginResourcePolicy: { policy: 'same-site' },
    contentSecurityPolicy: false,
  });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    allowList: (request) => request.url.startsWith('/health') || request.url.startsWith('/ready'),
  });
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });

  app.decorateRequest('auth', null);
  app.decorate('prisma', prisma);

  app.addHook('onRequest', async (request, reply) => {
    const method = request.method.toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const isSecretEndpoint =
        request.url.startsWith('/api/webhooks/') || request.url.startsWith('/api/internal/');
      if (!isSecretEndpoint) {
        const origin = request.headers.origin;
        const referer = request.headers.referer;
        const candidate = origin ?? referer;
        if (candidate) {
          try {
            const host = new URL(candidate).host;
            const allowed = [new URL(env.WEB_URL).host, new URL(env.API_URL).host];
            if (!allowed.includes(host)) {
              return reply.code(403).send({ error: 'Origin not allowed' });
            }
          } catch {
            return reply.code(403).send({ error: 'Invalid origin' });
          }
        }
      }
    }
    return undefined;
  });

  app.addHook('preHandler', async (request, reply) => {
    if (isPublicPath(request.url)) {
      request.auth = null;
      return;
    }
    request.auth = await loadSession(request);
    if (!request.auth) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    return undefined;
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'api',
    version: '1.0.0',
    dryRun: env.DRY_RUN,
    timestamp: new Date().toISOString(),
  }));

  app.get('/ready', async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ready',
        database: 'ok',
        dryRun: env.DRY_RUN,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return reply.code(503).send({
        status: 'not-ready',
        database: 'error',
        error: (error as Error).message,
      });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Validation failed',
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.message, details: error.details });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return reply.code(404).send({ error: 'Record not found' });
      if (error.code === 'P2002') return reply.code(409).send({ error: 'Record already exists' });
      if (error.code === 'P2003') return reply.code(400).send({ error: 'Related record does not exist' });
    }
    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.code(429).send({ error: 'Rate limit exceeded. Try again shortly.' });
    }
    if ((error as { statusCode?: number }).statusCode === 413) {
      return reply.code(413).send({ error: 'File too large' });
    }
    request.log.error({ err: error }, 'Unhandled request error');
    return reply.code(500).send({ error: 'Internal server error' });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: `Route not found: ${request.method} ${request.url.split('?')[0]}` });
  });

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(profileRoutes);
  await app.register(resumeRoutes);
  await app.register(jobRoutes);
  await app.register(applicationRoutes);
  await app.register(approvalRoutes);
  await app.register(contactRoutes);
  await app.register(outreachRoutes);
  await app.register(interviewRoutes);
  await app.register(followUpRoutes);
  await app.register(analyticsRoutes);
  await app.register(settingsRoutes);
  await app.register(webhookRoutes);
  await app.register(internalRoutes);
  await app.register(documentRoutes);

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    prisma: typeof prisma;
  }
}
