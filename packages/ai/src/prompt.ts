import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface Prompt {
  name: string;
  version: string;
  content: string;
}

export interface PromptOverride {
  name: string;
  version: string;
  content: string;
}

const VERSION_PATTERN = /^\s*<!--\s*version:\s*([^\s>]+)\s*-->\s*/i;

export function parsePromptFile(name: string, raw: string): Prompt {
  const match = raw.match(VERSION_PATTERN);
  const version = match?.[1] ?? '1.0.0';
  const content = match ? raw.slice(match[0].length).trimStart() : raw.trimStart();
  return { name, version, content };
}

export function renderPrompt(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = key.includes('.')
      ? key.split('.').reduce<unknown>((acc, part) => {
          if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part];
          return undefined;
        }, values)
      : values[key];
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
  });
}

export class PromptLibrary {
  private readonly directory: string;
  private cached: Map<string, Prompt> | null = null;

  constructor(directory?: string) {
    this.directory = resolve(
      directory ?? process.env.PROMPTS_DIR ?? join(process.cwd(), '..', '..', 'prompts'),
    );
  }

  async list(): Promise<Prompt[]> {
    if (this.cached) return [...this.cached.values()].sort((a, b) => a.name.localeCompare(b.name));
    const entries = await readdir(this.directory).catch(() => [] as string[]);
    const prompts = new Map<string, Prompt>();
    await Promise.all(
      entries
        .filter((entry) => entry.endsWith('.md'))
        .map(async (entry) => {
          const raw = await readFile(join(this.directory, entry), 'utf8');
          const name = entry.replace(/\.md$/, '');
          prompts.set(name, parsePromptFile(name, raw));
        }),
    );
    this.cached = prompts;
    return [...prompts.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(name: string, overrides: PromptOverride[] = []): Promise<Prompt> {
    const override = overrides.find((item) => item.name === name);
    if (override) return override;
    const prompts = await this.list();
    const found = prompts.find((prompt) => prompt.name === name);
    if (!found) throw new Error(`Prompt not found: ${name}`);
    return found;
  }

  invalidate(): void {
    this.cached = null;
  }
}
