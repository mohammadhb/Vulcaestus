import 'dotenv/config';
import { z } from 'zod';

const boolString = z
  .union([z.boolean(), z.string()])
  .transform((value) => (typeof value === 'boolean' ? value : ['true', '1', 'yes', 'on'].includes(value.toLowerCase())));

const intString = z.union([z.number(), z.string()]).transform((value) => Number(value));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: intString.pipe(z.number().int().positive()).default(4000),
  HOST: z.string().default('0.0.0.0'),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
  DATABASE_URL: z
    .string()
    .default('postgresql://vulcaestus:vulcaestus@localhost:5432/vulcaestus?schema=public'),
  REDIS_URL: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
  TRUST_PROXY: boolString.default(false),
  COOKIE_SECURE: boolString.optional(),
  SESSION_SECRET: z.string().min(16).default('development-session-secret-change-me'),
  SESSION_TTL_HOURS: intString.pipe(z.number().int().positive()).default(24 * 14),
  SECRETS_KEY: z.string().default('development-secrets-key-change-me-please'),
  SERVICE_API_KEY: z.string().min(8).default('development-service-key'),
  WEBHOOK_SECRET: z.string().min(8).default('development-webhook-secret'),
  BROWSER_WORKER_URL: z.string().url().default('http://localhost:4100'),
  BROWSER_WORKER_SECRET: z.string().min(8).default('development-worker-secret'),
  DRY_RUN: boolString.default(true),
  PROMPTS_DIR: z.string().optional(),
  STORAGE_DIR: z.string().default('./storage'),
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('qwen2.5:7b-instruct'),
  AI_PROVIDER: z.string().default('OLLAMA'),
  AI_TIMEOUT_MS: intString.pipe(z.number().int().positive()).default(180000),
  AI_ENABLED: boolString.default(true),
  RATE_LIMIT_MAX: intString.pipe(z.number().int().positive()).default(300),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: intString.pipe(z.number().int().positive()).optional(),
  EMAIL_SECURE: boolString.default(false),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  NOTIFICATIONS_ENABLED: boolString.default(true),
  FOLLOWUP_DAYS: intString.pipe(z.number().int().positive()).default(7),
  MAX_JOBS_PER_DAY: intString.pipe(z.number().int().positive()).default(200),
  MAX_FOLLOWUPS_PER_DAY: intString.pipe(z.number().int().positive()).default(20),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  COOKIE_SECURE:
    parsed.data.COOKIE_SECURE ?? parsed.data.WEB_URL.startsWith('https://') ?? false,
};

if (env.NODE_ENV === 'production') {
  const weak = [
    ['SESSION_SECRET', env.SESSION_SECRET],
    ['SECRETS_KEY', env.SECRETS_KEY],
    ['SERVICE_API_KEY', env.SERVICE_API_KEY],
    ['WEBHOOK_SECRET', env.WEBHOOK_SECRET],
    ['BROWSER_WORKER_SECRET', env.BROWSER_WORKER_SECRET],
  ].filter(([, value]) => typeof value === 'string' && /development-|change-me/i.test(value));
  if (weak.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `WARNING: production is using development defaults for: ${weak.map(([k]) => k).join(', ')}. Set secure values before exposing this service.`,
    );
  }
}
