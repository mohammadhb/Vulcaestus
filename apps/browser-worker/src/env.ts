import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((value) => (typeof value === 'boolean' ? value : ['true', '1', 'yes'].includes(value.toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4100),
  HOST: z.string().default('0.0.0.0'),
  WORKER_SECRET: z.string().min(8).default('development-worker-secret'),
  API_URL: z.string().url().default('http://localhost:4000'),
  STORAGE_DIR: z.string().default('./storage'),
  PROFILES_DIR: z.string().default('./browser/profiles'),
  DRY_RUN: bool.default(true),
  HEADLESS: bool.default(true),
  MAX_CONCURRENT: z.coerce.number().int().min(1).max(4).default(1),
  ACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  LOG_LEVEL: z.string().default('info'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid worker environment', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
