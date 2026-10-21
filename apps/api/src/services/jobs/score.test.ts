import { describe, expect, it } from 'vitest';
import { computeDeterministicScore, type ScoringJob, type ScoringProfile } from './score.js';

const profile: ScoringProfile = {
  yearsExperience: 7,
  targetTitles: ['Backend Engineer'],
  alternativeTitles: ['Platform Engineer'],
  targetCountries: ['Germany'],
  targetCities: ['Berlin'],
  remotePreference: 'REMOTE',
  minimumSalary: 80000,
  preferredSalary: 100000,
  currency: 'EUR',
  employmentTypes: ['FULL_TIME'],
  seniority: 'SENIOR',
  industries: ['Software'],
  priorityCompanies: [],
  excludedCompanies: ['Bad Corp'],
  technologies: ['TypeScript', 'Node.js', 'PostgreSQL', 'AWS', 'Kubernetes'],
  languages: ['English'],
  workAuthorization: 'EU citizen',
  authorizedCountries: ['Germany'],
  sponsorshipRequired: false,
  sponsorshipAcceptable: true,
  relocationPreference: 'Open within EU',
  minimumJobScore: 70,
  tailorThreshold: 80,
  autoApplyThreshold: 90,
};

const job: ScoringJob = {
  title: 'Senior Backend Engineer',
  company: 'Good GmbH',
  location: 'Berlin, Germany',
  country: 'Germany',
  remoteType: 'REMOTE',
  employmentType: 'FULL_TIME',
  seniority: 'SENIOR',
  salaryMin: 90000,
  salaryMax: 110000,
  currency: 'EUR',
  requiredSkills: ['typescript', 'postgresql', 'aws', 'terraform'],
  preferredSkills: ['kubernetes'],
  yearsExperience: 5,
  visaSponsorship: null,
  industry: 'Software',
  languageRequirements: ['English'],
  description: 'Build backend services.',
};

describe('deterministic job scoring', () => {
  it('scores a strong match and lists missing evidence', () => {
    const score = computeDeterministicScore(profile, job, profile.technologies);
    expect(score.overallScore).toBeGreaterThanOrEqual(80);
    expect(score.technicalScore).toBeGreaterThan(70);
    expect(score.missingRequirements).toEqual(['terraform']);
    expect(score.strongMatches).toContain('typescript');
    expect(score.recommendation).toMatch(/APPLY|STRONG_APPLY|REVIEW/);
  });

  it('rejects excluded companies even when skills match', () => {
    const score = computeDeterministicScore(profile, { ...job, company: 'Bad Corp' }, profile.technologies);
    expect(score.overallScore).toBe(0);
    expect(score.recommendation).toBe('REJECT');
  });

  it('penalizes a large experience gap', () => {
    const junior = { ...profile, yearsExperience: 1, seniority: 'JUNIOR' };
    const score = computeDeterministicScore(junior, { ...job, yearsExperience: 8 }, profile.technologies);
    expect(score.experienceScore).toBeLessThan(45);
    expect(score.seniorityScore).toBeLessThan(60);
    expect(score.risks.some((risk) => risk.includes('years'))).toBe(true);
  });

  it('flags missing sponsorship when it is required', () => {
    const score = computeDeterministicScore(
      { ...profile, authorizedCountries: [], sponsorshipRequired: true },
      { ...job, visaSponsorship: false },
      profile.technologies,
    );
    expect(score.authorizationScore).toBeLessThan(30);
    expect(score.risks.some((risk) => risk.includes('sponsorship'))).toBe(true);
  });

  it('stays neutral when salary is not posted', () => {
    const score = computeDeterministicScore(profile, { ...job, salaryMin: null, salaryMax: null }, profile.technologies);
    expect(score.salaryScore).toBe(70);
  });
});
