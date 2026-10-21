import { describe, expect, it } from 'vitest';
import { findDuplicate, jaccardSimilarity, titleTokens } from './dedupe.js';
import { normalizeJobInput } from './normalize.js';

const baseJob = {
  title: 'Senior Backend Engineer',
  company: 'Example GmbH',
  location: 'Berlin, Germany',
  description: 'We need TypeScript, PostgreSQL, AWS and Kubernetes experience.',
  url: 'https://example.com/jobs/123?utm_source=linkedin',
  source: 'greenhouse',
  externalId: 'gh-123',
};

describe('job normalization', () => {
  it('normalizes URLs and creates a stable fingerprint', () => {
    const first = normalizeJobInput({ ...baseJob } as never);
    const second = normalizeJobInput({
      ...baseJob,
      url: 'https://www.example.com/jobs/123/',
    } as never);
    expect(first.canonicalUrl).toBe('https://example.com/jobs/123');
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.companyNormalized).toBe('example');
  });

  it('extracts remote type, seniority and skills', () => {
    const job = normalizeJobInput({
      ...baseJob,
      description: 'Fully remote. We require 5+ years of experience with TypeScript and PostgreSQL. Kubernetes is a plus.',
    } as never);
    expect(job.remoteType).toBe('REMOTE');
    expect(job.seniority).toBe('SENIOR');
    expect(job.requiredSkills).toContain('typescript');
    expect(job.requiredSkills).toContain('postgresql');
    expect(job.yearsExperience).toBe(5);
  });

  it('keeps an unknown sponsorship as null instead of guessing', () => {
    const job = normalizeJobInput(baseJob as never);
    expect(job.visaSponsorship).toBeNull();
  });
});

describe('duplicate detection', () => {
  const existing = [
    {
      id: 'job-1',
      source: 'greenhouse',
      externalId: 'gh-123',
      canonicalUrl: 'https://example.com/jobs/123',
      fingerprint: 'fingerprint-1',
      companyNormalized: 'example',
      title: 'Senior Backend Engineer',
      location: 'Berlin, Germany',
    },
  ];

  it('finds duplicates by external id', () => {
    const match = findDuplicate(
      {
        source: 'greenhouse',
        externalId: 'gh-123',
        canonicalUrl: null,
        fingerprint: 'different',
        companyNormalized: 'example',
        title: 'Backend Engineer',
        location: 'Berlin',
      },
      existing,
    );
    expect(match).toEqual({ id: 'job-1', reason: 'external_id' });
  });

  it('finds duplicates by canonical URL', () => {
    const match = findDuplicate(
      {
        source: 'lever',
        externalId: 'lev-9',
        canonicalUrl: 'https://example.com/jobs/123',
        fingerprint: 'different',
        companyNormalized: 'example',
        title: 'Backend Engineer',
        location: 'Berlin',
      },
      existing,
    );
    expect(match?.reason).toBe('canonical_url');
  });

  it('uses similarity for reposted roles with slightly different titles', () => {
    const match = findDuplicate(
      {
        source: 'rss',
        externalId: null,
        canonicalUrl: null,
        fingerprint: 'different',
        companyNormalized: 'example',
        title: 'Backend Engineer - Remote',
        location: 'Remote',
      },
      existing,
    );
    expect(match?.reason).toBe('semantic_similarity');
    expect(match?.id).toBe('job-1');
  });

  it('does not collapse genuinely different roles', () => {
    const match = findDuplicate(
      {
        source: 'rss',
        externalId: null,
        canonicalUrl: null,
        fingerprint: 'different',
        companyNormalized: 'example',
        title: 'Product Designer',
        location: 'Berlin',
      },
      existing,
    );
    expect(match).toBeNull();
  });

  it('calculates token similarity without seniority noise', () => {
    expect(jaccardSimilarity('Senior Backend Engineer', 'Backend Engineer')).toBe(1);
    expect(titleTokens('Senior Backend Engineer (m/f/d)').has('senior')).toBe(false);
  });
});
