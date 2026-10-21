export interface DuplicateCandidate {
  id: string;
  source: string;
  externalId: string | null;
  canonicalUrl: string | null;
  fingerprint: string;
  companyNormalized: string;
  title: string;
  location: string | null;
}

export interface DuplicateInput {
  source: string;
  externalId: string | null;
  canonicalUrl: string | null;
  fingerprint: string;
  companyNormalized: string;
  title: string;
  location: string | null;
}

export interface DuplicateMatch {
  id: string;
  reason: 'external_id' | 'canonical_url' | 'fingerprint' | 'semantic_similarity';
  similarity?: number;
}

export function titleTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/\b(senior|sr|junior|jr|lead|staff|principal|remote|hybrid|m\/f\/d|all genders)\b/g, '')
      .replace(/[^a-z0-9+#.]+/g, ' ')
      .split(' ')
      .filter((token) => token.length > 1),
  );
}

export function jaccardSimilarity(a: string, b: string): number {
  const left = titleTokens(a);
  const right = titleTokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function normalizeLocation(value: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Deterministic duplicate detection, ordered by confidence.
 * Semantic similarity is only used for the same normalized company.
 */
export function findDuplicate(input: DuplicateInput, existing: DuplicateCandidate[]): DuplicateMatch | null {
  if (input.externalId) {
    const match = existing.find(
      (job) => job.source === input.source && job.externalId && job.externalId === input.externalId,
    );
    if (match) return { id: match.id, reason: 'external_id' };
  }

  if (input.canonicalUrl) {
    const match = existing.find((job) => job.canonicalUrl && job.canonicalUrl === input.canonicalUrl);
    if (match) return { id: match.id, reason: 'canonical_url' };
  }

  const fingerprintMatch = existing.find((job) => job.fingerprint === input.fingerprint);
  if (fingerprintMatch) return { id: fingerprintMatch.id, reason: 'fingerprint' };

  if (!input.companyNormalized) return null;
  const sameCompany = existing.filter((job) => job.companyNormalized === input.companyNormalized);
  if (sameCompany.length === 0) return null;

  let best: { job: DuplicateCandidate; score: number } | null = null;
  for (const job of sameCompany) {
    const score = jaccardSimilarity(input.title, job.title);
    if (!best || score > best.score) best = { job, score };
    if (score >= 0.9) break;
  }

  if (!best || best.score < 0.82) return null;

  const locationA = normalizeLocation(input.location);
  const locationB = normalizeLocation(best.job.location);
  if (locationA && locationB && locationA !== locationB) {
    const remoteWords = /remote|anywhere|worldwide/;
    if (!remoteWords.test(locationA) && !remoteWords.test(locationB)) return null;
  }

  return {
    id: best.job.id,
    reason: 'semantic_similarity',
    similarity: Number(best.score.toFixed(3)),
  };
}
