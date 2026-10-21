import { AiError, type AiJsonResult, type AiProvider, type AiRequest } from './types.js';
import type { ZodType } from 'zod';

function stripCodeFences(input: string): string {
  let text = input.trim();
  const fenced = text.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/);
  if (fenced?.[1]) text = fenced[1].trim();
  else {
    const inner = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
    if (inner?.[1]) text = inner[1].trim();
  }
  return text;
}

function removeTrailingCommas(input: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }
    if (char === ',') {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j] ?? '')) j += 1;
      if (input[j] === '}' || input[j] === ']') continue;
    }
    result += char;
  }
  return result;
}

/**
 * Extract the first balanced JSON object/array from model output.
 * Handles markdown fences, prose before/after, and trailing commas.
 */
export function extractJson(input: string): unknown {
  const cleaned = removeTrailingCommas(stripCodeFences(input));
  const starts: number[] = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    if (cleaned[i] === '{' || cleaned[i] === '[') {
      starts.push(i);
      break;
    }
  }
  if (starts.length === 0) {
    throw new AiError('No JSON object found in model response', 'PARSE_ERROR', {
      preview: cleaned.slice(0, 500),
    });
  }

  const start = starts[0]!;
  const open = cleaned[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i += 1) {
    const char = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        const candidate = cleaned.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch (error) {
          throw new AiError('Model response contained malformed JSON', 'PARSE_ERROR', {
            preview: candidate.slice(0, 500),
            cause: (error as Error).message,
          });
        }
      }
    }
  }

  throw new AiError('Model response contained unterminated JSON', 'PARSE_ERROR', {
    preview: cleaned.slice(0, 500),
  });
}

export interface GenerateJsonOptions<T> {
  provider: AiProvider;
  prompt: string;
  system?: string;
  schema?: ZodType<T>;
  normalize?: (value: unknown) => unknown;
  temperature?: number;
  maxTokens?: number;
  attempts?: number;
  onAttempt?: (info: { attempt: number; error?: Error; raw?: string; latencyMs: number }) => void;
}

export async function generateJson<T = unknown>(
  options: GenerateJsonOptions<T>,
): Promise<AiJsonResult<T> & { attempts: number }> {
  const attempts = Math.max(1, options.attempts ?? 2);
  let lastError: Error | undefined;
  let lastRaw = '';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const request: AiRequest = {
        system:
          (options.system ?? 'You are a precise assistant. Return only valid JSON.') +
          (attempt > 1
            ? '\n\nYour previous response could not be parsed. Return one complete, valid JSON document with double-quoted keys and no markdown.'
            : ''),
        prompt: options.prompt,
        temperature: options.temperature ?? 0.15,
        maxTokens: options.maxTokens,
        json: true,
      };
      const result = await options.provider.generate(request);
      lastRaw = result.text;
      const parsed = extractJson(result.text);
      const prepared = options.normalize ? options.normalize(parsed) : parsed;
      let data = prepared as T;
      if (options.schema) {
        const validated = options.schema.safeParse(prepared);
        if (!validated.success) {
          throw new AiError('AI response failed schema validation', 'VALIDATION_ERROR', {
            issues: validated.error.issues,
          });
        }
        data = validated.data;
      }
      options.onAttempt?.({ attempt, raw: result.text, latencyMs: result.latencyMs });
      return {
        data,
        raw: result.text,
        model: result.model,
        latencyMs: result.latencyMs,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error as Error;
      options.onAttempt?.({
        attempt,
        error: lastError,
        raw: lastError instanceof AiError && lastError.code === 'PARSE_ERROR' ? lastRaw : lastRaw || undefined,
        latencyMs: 0,
      });
      if (error instanceof AiError && error.code === 'CONFIG_ERROR') throw error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }

  if (lastError instanceof AiError) throw lastError;
  throw new AiError(`AI generation failed: ${lastError?.message ?? 'unknown error'}`, 'PROVIDER_ERROR');
}

export async function generateText(
  provider: AiProvider,
  prompt: string,
  system?: string,
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<{ text: string; model: string; latencyMs: number }> {
  const result = await provider.generate({
    prompt,
    system,
    temperature: options.temperature ?? 0.3,
    maxTokens: options.maxTokens,
  });
  return { text: result.text, model: result.model, latencyMs: result.latencyMs };
}
