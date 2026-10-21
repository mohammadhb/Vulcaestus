import { prisma, type GenerationKind, type Prisma } from '@vulcaestus/db';
import {
  PromptLibrary,
  createProvider,
  generateJson,
  generateText,
  renderPrompt,
  type AiProvider,
  type AiProviderConfig,
} from '@vulcaestus/ai';
import type { ZodType } from 'zod';
import { env } from '../env.js';
import { decryptSecret } from '../lib/crypto.js';
import { jsonValue } from '../lib/http.js';

const library = new PromptLibrary(env.PROMPTS_DIR);

export interface ResolvedProvider {
  provider: AiProvider;
  label: string;
  configId: string | null;
  model: string;
}

export interface PromptDefinition {
  name: string;
  version: string;
  content: string;
  source: 'database' | 'file';
}

export async function loadPrompt(name: string): Promise<PromptDefinition> {
  const override = await prisma.prompt.findUnique({ where: { name } });
  if (override) {
    return {
      name: override.name,
      version: override.version,
      content: override.content,
      source: 'database',
    };
  }
  const prompt = await library.get(name);
  return { ...prompt, source: 'file' };
}

export async function listPrompts(): Promise<PromptDefinition[]> {
  const [files, overrides] = await Promise.all([
    library.list(),
    prisma.prompt.findMany(),
  ]);
  const byName = new Map<string, PromptDefinition>();
  files.forEach((file) =>
    byName.set(file.name, { ...file, source: 'file' }),
  );
  overrides.forEach((override) =>
    byName.set(override.name, {
      name: override.name,
      version: override.version,
      content: override.content,
      source: 'database',
    }),
  );
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveProvider(explicitName?: string): Promise<ResolvedProvider> {
  const configs = await prisma.aiProviderConfig.findMany({
    where: { enabled: true },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });
  const chosen = explicitName
    ? configs.find((config) => config.name === explicitName)
    : configs[0];

  if (chosen) {
    let apiKey: string | null = null;
    if (chosen.apiKeyEncrypted) {
      try {
        apiKey = decryptSecret(chosen.apiKeyEncrypted);
      } catch {
        apiKey = null;
      }
    }
    const provider = createProvider({
      kind: chosen.provider,
      model: chosen.model,
      baseUrl: chosen.baseUrl,
      apiKey,
      settings: {
        ...(chosen.settings as Record<string, unknown>),
        timeoutMs: env.AI_TIMEOUT_MS,
      },
    });
    return { provider, label: chosen.name, configId: chosen.id, model: chosen.model };
  }

  const provider = createProvider({
    kind: (env.AI_PROVIDER as AiProviderConfig['kind']) ?? 'OLLAMA',
    model: env.OLLAMA_MODEL,
    baseUrl: env.OLLAMA_BASE_URL,
    settings: { timeoutMs: env.AI_TIMEOUT_MS },
  });
  return {
    provider,
    label: `env:${env.AI_PROVIDER}`,
    configId: null,
    model: env.OLLAMA_MODEL,
  };
}

async function logGeneration(entry: {
  kind: GenerationKind;
  model: string;
  promptVersion: string;
  entityType?: string;
  entityId?: string;
  inputRefs?: Record<string, unknown>;
  output?: unknown;
  outputText?: string;
  latencyMs?: number;
  success: boolean;
  error?: string;
}): Promise<void> {
  const isUuid =
    typeof entry.entityId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.entityId);
  try {
    await prisma.aiGeneration.create({
      data: {
        kind: entry.kind,
        model: entry.model,
        promptVersion: entry.promptVersion,
        entityType: entry.entityType,
        entityId: isUuid ? entry.entityId : null,
        inputRefs: jsonValue(entry.inputRefs ?? {}),
        output: jsonValue(entry.output ?? {}),
        outputText: entry.outputText,
        latencyMs: entry.latencyMs,
        success: entry.success,
        error: entry.error?.slice(0, 4000),
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('AI generation log failed', (error as Error).message);
  }
}

export interface RunJsonOptions<T> {
  kind: GenerationKind;
  promptName: string;
  variables: Record<string, unknown>;
  schema: ZodType<T>;
  normalize?: (value: unknown) => unknown;
  entityType?: string;
  entityId?: string;
  inputRefs?: Record<string, unknown>;
  attempts?: number;
  maxTokens?: number;
  system?: string;
}

export interface RunJsonResult<T> {
  data: T;
  model: string;
  promptVersion: string;
  raw: string;
  latencyMs: number;
  attempts: number;
}

/**
 * Run a structured generation. Returns null when AI is disabled or unavailable,
 * so callers can use their deterministic fallback. Failures are always logged.
 */
export async function runAiJson<T>(options: RunJsonOptions<T>): Promise<RunJsonResult<T> | null> {
  const prompt = await loadPrompt(options.promptName);
  if (!env.AI_ENABLED) {
    await logGeneration({
      kind: options.kind,
      model: 'disabled',
      promptVersion: prompt.version,
      entityType: options.entityType,
      entityId: options.entityId,
      inputRefs: options.inputRefs,
      output: {},
      success: false,
      error: 'AI is disabled by configuration',
    });
    return null;
  }

  let resolved: ResolvedProvider;
  try {
    resolved = await resolveProvider();
  } catch (error) {
    await logGeneration({
      kind: options.kind,
      model: 'unavailable',
      promptVersion: prompt.version,
      entityType: options.entityType,
      entityId: options.entityId,
      inputRefs: options.inputRefs,
      success: false,
      error: (error as Error).message,
    });
    return null;
  }

  const rendered = renderPrompt(prompt.content, options.variables);
  try {
    const result = await generateJson({
      provider: resolved.provider,
      prompt: rendered,
      schema: options.schema,
      normalize: options.normalize,
      system: options.system,
      attempts: options.attempts ?? 2,
      maxTokens: options.maxTokens,
    });
    await logGeneration({
      kind: options.kind,
      model: result.model,
      promptVersion: prompt.version,
      entityType: options.entityType,
      entityId: options.entityId,
      inputRefs: options.inputRefs,
      output: result.data as Record<string, unknown>,
      latencyMs: result.latencyMs,
      success: true,
    });
    return {
      data: result.data,
      model: result.model,
      promptVersion: prompt.version,
      raw: result.raw,
      latencyMs: result.latencyMs,
      attempts: result.attempts,
    };
  } catch (error) {
    const detail = (error as { details?: unknown }).details;
    await logGeneration({
      kind: options.kind,
      model: resolved.model,
      promptVersion: prompt.version,
      entityType: options.entityType,
      entityId: options.entityId,
      inputRefs: options.inputRefs,
      success: false,
      error: `${(error as Error).message}${detail ? `: ${JSON.stringify(detail).slice(0, 1500)}` : ''}`,
    });
    return null;
  }
}

export async function runAiText(options: {
  kind: GenerationKind;
  promptName: string;
  variables: Record<string, unknown>;
  entityType?: string;
  entityId?: string;
  inputRefs?: Record<string, unknown>;
  fallbackModel?: string;
}): Promise<{ text: string; model: string; promptVersion: string } | null> {
  const prompt = await loadPrompt(options.promptName);
  if (!env.AI_ENABLED) return null;
  let resolved: ResolvedProvider;
  try {
    resolved = await resolveProvider();
  } catch {
    return null;
  }
  const rendered = renderPrompt(prompt.content, options.variables);
  try {
    const result = await generateText(resolved.provider, rendered, undefined, {
      temperature: 0.35,
      maxTokens: 3000,
    });
    await logGeneration({
      kind: options.kind,
      model: result.model,
      promptVersion: prompt.version,
      entityType: options.entityType,
      entityId: options.entityId,
      inputRefs: options.inputRefs,
      outputText: result.text,
      latencyMs: result.latencyMs,
      success: true,
    });
    return { text: result.text.trim(), model: result.model, promptVersion: prompt.version };
  } catch (error) {
    await logGeneration({
      kind: options.kind,
      model: resolved.model,
      promptVersion: prompt.version,
      entityType: options.entityType,
      entityId: options.entityId,
      inputRefs: options.inputRefs,
      success: false,
      error: (error as Error).message,
    });
    return null;
  }
}

export async function testProvider(config: {
  provider: Prisma.AiProviderConfigGetPayload<object>['provider'];
  model: string;
  baseUrl?: string | null;
  apiKeyEncrypted?: string | null;
}): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  const started = Date.now();
  try {
    const provider = createProvider({
      kind: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
      apiKey: config.apiKeyEncrypted ? decryptSecret(config.apiKeyEncrypted) : null,
      settings: { timeoutMs: Math.min(env.AI_TIMEOUT_MS, 60_000) },
    });
    const result = await provider.generate({
      prompt: 'Reply with exactly the word OK.',
      system: 'You are a connection test.',
      temperature: 0,
      maxTokens: 10,
    });
    return {
      ok: Boolean(result.text),
      latencyMs: Date.now() - started,
      message: result.text.slice(0, 200),
    };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - started, message: (error as Error).message };
  }
}

export { library as promptLibrary };
