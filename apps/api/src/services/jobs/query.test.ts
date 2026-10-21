import { describe, expect, it } from 'vitest';
import { buildJobWhere, matchesScoreFilters, parseJobFilters, scoreFilterActive } from './query.js';

const profileId = '11111111-1111-4111-8111-111111111111';

describe('job filters', () => {
  it('defaults to active, non-archived jobs for the profile', () => {
    const where = buildJobWhere(profileId, parseJobFilters({}));
    expect(where.profileId).toBe(profileId);
    expect(where.deletedAt).toBeNull();
    expect(where.archivedAt).toBeNull();
  });

  it('scopes archived and deleted views differently', () => {
    const archived = buildJobWhere(profileId, parseJobFilters({ view: 'archived' }));
    expect(archived.deletedAt).toBeNull();
    expect(archived.archivedAt).toEqual({ not: null });

    const deleted = buildJobWhere(profileId, parseJobFilters({ view: 'deleted' }));
    expect(deleted.deletedAt).toEqual({ not: null });
    expect(deleted.archivedAt).toBeUndefined();
  });

  it('applies text, source, work mode, and application filters', () => {
    const where = buildJobWhere(
      profileId,
      parseJobFilters({
        q: 'backend',
        source: 'greenhouse',
        remoteType: 'REMOTE',
        hasApplication: 'false',
      }),
    );
    expect(where.OR).toBeDefined();
    expect(where.source).toBe('greenhouse');
    expect(where.remoteType).toBe('REMOTE');
    expect(where.applications).toEqual({ none: { profileId, deletedAt: null } });
  });

  it('parses score filters and detects their presence', () => {
    const filters = parseJobFilters({ minScore: '80', recommendation: 'APPLY' });
    expect(filters.minScore).toBe(80);
    expect(filters.recommendation).toBe('APPLY');
    expect(scoreFilterActive(filters)).toBe(true);
    expect(scoreFilterActive(parseJobFilters({}))).toBe(false);
  });

  it('matches only the latest score supplied by the query', () => {
    const filters = parseJobFilters({ minScore: '80', recommendation: 'APPLY' });
    expect(matchesScoreFilters({ scores: [{ overallScore: 84, recommendation: 'APPLY' }] }, filters)).toBe(true);
    expect(matchesScoreFilters({ scores: [{ overallScore: 84, recommendation: 'REVIEW' }] }, filters)).toBe(false);
    expect(matchesScoreFilters({ scores: [{ overallScore: 70, recommendation: 'APPLY' }] }, filters)).toBe(false);
    expect(matchesScoreFilters({ scores: [] }, filters)).toBe(false);
  });
});
