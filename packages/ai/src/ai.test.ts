import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { extractJson } from './json.js';
import { parsePromptFile, renderPrompt } from './prompt.js';

describe('extractJson', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses fenced JSON with surrounding prose', () => {
    const raw = 'Here is the result:\n```json\n{"overallScore": 91, "missingRequirements": ["Terraform"]}\n```\nDone.';
    expect(extractJson(raw)).toEqual({ overallScore: 91, missingRequirements: ['Terraform'] });
  });

  it('removes trailing commas', () => {
    expect(extractJson('{"a": [1,2,3,], "b": {"c": 2,},}')).toEqual({ a: [1, 2, 3], b: { c: 2 } });
  });

  it('handles braces inside strings', () => {
    expect(extractJson('{"text":"use {curly} braces", "n":1}')).toEqual({
      text: 'use {curly} braces',
      n: 1,
    });
  });

  it('rejects non-json output', () => {
    expect(() => extractJson('I cannot comply with that request.')).toThrow(/No JSON object/);
  });
});

describe('prompt rendering', () => {
  it('reads the version comment and strips it', () => {
    const prompt = parsePromptFile('test', '<!-- version: 2.1.0 -->\nHello {{name}}');
    expect(prompt.version).toBe('2.1.0');
    expect(prompt.content).toBe('Hello {{name}}');
  });

  it('renders nested values and objects', () => {
    const rendered = renderPrompt('Hi {{name}}, job: {{job.title}}. Data: {{data}}', {
      name: 'Ada',
      job: { title: 'Engineer' },
      data: { a: 1 },
    });
    expect(rendered).toContain('Hi Ada, job: Engineer');
    expect(rendered).toContain('"a": 1');
  });
});

describe('score schema', () => {
  it('coerces missing optional subscores', () => {
    const schema = z.object({ overall: z.number(), tags: z.array(z.string()).default([]) });
    const parsed = schema.parse({ overall: 90 });
    expect(parsed.tags).toEqual([]);
  });
});
