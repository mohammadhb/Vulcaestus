import Fastify from 'fastify';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from './env.js';
import { executeAction, type ActionResult, type WorkerAction } from './actions.js';

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    redact: ['req.headers["x-worker-secret"]'],
    ...(env.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } } }
      : {}),
  },
  bodyLimit: 1024 * 1024,
});

const actionSchema = z.object({
  actionId: z.string().uuid(),
  kind: z.enum(['APPLICATION_SUBMIT', 'LINKEDIN_PREPARE', 'LINKEDIN_SEND', 'PAGE_CAPTURE']),
  dryRun: z.boolean().default(true),
  profileId: z.string().uuid(),
  callbackUrl: z.string().url(),
  request: z
    .object({
      url: z.string().url().optional(),
      company: z.string().optional(),
      title: z.string().optional(),
      fields: z.array(z.object({ label: z.string(), value: z.string(), source: z.string().optional() })).optional(),
      humanReview: z.array(z.object({ label: z.string(), answer: z.string().optional(), sensitive: z.boolean().optional() })).optional(),
      files: z.array(z.object({ name: z.string(), path: z.string(), inputHint: z.string() })).optional(),
      confirmSubmit: z.boolean().optional(),
      message: z.string().optional(),
      contact: z
        .object({ name: z.string().optional(), title: z.string().optional(), company: z.string().optional() })
        .optional(),
    })
    .passthrough(),
});

type SubmittedAction = z.infer<typeof actionSchema>;

const actions = new Map<string, { status: string; result?: ActionResult; updatedAt: string }>();
const queue: WorkerAction[] = [];
const profileLocks = new Map<string, Promise<unknown>>();
let active = 0;

function verify(request: { headers: Record<string, unknown> }): void {
  const secret = request.headers['x-worker-secret'];
  if (typeof secret !== 'string' || secret !== env.WORKER_SECRET) {
    const error = new Error('Invalid worker secret') as Error & { statusCode: number };
    error.statusCode = 401;
    throw error;
  }
}

async function callback(action: WorkerAction, result: ActionResult): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(action.callbackUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-worker-secret': env.WORKER_SECRET,
        },
        body: JSON.stringify(result),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(`Callback returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
      }
      return;
    } catch (error) {
      app.log.warn({ err: error, actionId: action.actionId, attempt }, 'callback failed');
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  app.log.error({ actionId: action.actionId }, 'callback exhausted retries; API DB is source of truth');
}

async function withProfileLock<T>(profileId: string, task: () => Promise<T>): Promise<T> {
  const previous = profileLocks.get(profileId) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chain = previous.then(() => current);
  profileLocks.set(profileId, chain);
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (profileLocks.get(profileId) === chain) profileLocks.delete(profileId);
  }
}

async function run(action: WorkerAction): Promise<void> {
  actions.set(action.actionId, { status: 'RUNNING', updatedAt: new Date().toISOString() });
  let result: ActionResult;
  try {
    result = await withProfileLock(action.profileId, () =>
      Promise.race([
        executeAction(action),
        new Promise<ActionResult>((resolve) =>
          setTimeout(
            () =>
              resolve({
                status: 'FAILED',
                error: `Action timed out after ${env.ACTION_TIMEOUT_MS}ms`,
              }),
            env.ACTION_TIMEOUT_MS,
          ),
        ),
      ]),
    );
  } catch (error) {
    result = { status: 'FAILED', error: (error as Error).message.slice(0, 4000) };
  }
  actions.set(action.actionId, {
    status: result.status,
    result,
    updatedAt: new Date().toISOString(),
  });
  await callback(action, result);
  app.log.info(
    { actionId: action.actionId, kind: action.kind, status: result.status },
    'browser action finished',
  );
}

function pump(): void {
  while (active < env.MAX_CONCURRENT && queue.length > 0) {
    const action = queue.shift()!;
    active += 1;
    void run(action).finally(() => {
      active -= 1;
      pump();
    });
  }
}

app.get('/health', async () => ({
  status: 'ok',
  service: 'browser-worker',
  dryRun: env.DRY_RUN,
  headless: env.HEADLESS,
  queue: queue.length,
  active,
  timestamp: new Date().toISOString(),
}));

app.get('/ready', async (_request, reply) => {
  try {
    await mkdir(env.STORAGE_DIR, { recursive: true });
    await mkdir(env.PROFILES_DIR, { recursive: true });
    return { status: 'ready', browser: 'playwright', dryRun: env.DRY_RUN };
  } catch (error) {
    return reply.code(503).send({ status: 'not-ready', error: (error as Error).message });
  }
});

app.post('/v1/actions', async (request, reply) => {
  verify(request);
  const input = actionSchema.parse(request.body) as SubmittedAction;
  const action: WorkerAction = {
    ...input,
    dryRun: input.dryRun || env.DRY_RUN,
  };
  actions.set(input.actionId, { status: 'QUEUED', updatedAt: new Date().toISOString() });
  queue.push(action);
  pump();
  return reply.code(202).send({
    id: input.actionId,
    status: action.dryRun ? 'SIMULATED_QUEUED' : 'QUEUED',
    dryRun: action.dryRun,
  });
});

app.get('/v1/actions/:id', async (request, reply) => {
  verify(request);
  const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
  const record = actions.get(id);
  if (!record) return reply.code(404).send({ error: 'Action not found in this worker instance' });
  return record;
});

app.setErrorHandler((error, request, reply) => {
  const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
  request.log.error({ err: error }, 'worker request failed');
  reply.code(statusCode).send({ error: (error as Error).message });
});

async function main(): Promise<void> {
  await mkdir(env.STORAGE_DIR, { recursive: true });
  await mkdir(env.PROFILES_DIR, { recursive: true });
  // Fail fast if the browser cannot be launched.
  const { chromium } = await import('playwright');
  const executable = chromium.executablePath();
  app.log.info({ executable, headless: env.HEADLESS }, 'playwright runtime detected');
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info({ port: env.PORT, dryRun: env.DRY_RUN }, 'Browser worker started');
}

main().catch((error) => {
  app.log.error({ err: error }, 'failed to start browser worker');
  process.exit(1);
});

export { app };
