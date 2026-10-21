import { describe, expect, it } from 'vitest';
import type { CandidateProfile, Job, Resume } from '@vulcaestus/db';
import { heuristicAnswer, isSensitiveQuestion } from './answers.js';

const profile = {
  id: 'profile-1',
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: null,
  location: 'Berlin',
  country: 'Germany',
  linkedinUrl: 'https://linkedin.com/in/ada',
  githubUrl: null,
  portfolioUrl: null,
  headline: 'Backend engineer',
  summary: 'Backend engineer with seven years of experience.',
  yearsExperience: 7,
  targetTitles: ['Backend Engineer'],
  alternativeTitles: [],
  targetCountries: ['Germany'],
  targetCities: ['Berlin'],
  remotePreference: 'REMOTE',
  minimumSalary: 80000,
  preferredSalary: 100000,
  currency: 'EUR',
  employmentTypes: [],
  seniority: 'SENIOR',
  industries: [],
  priorityCompanies: [],
  excludedCompanies: [],
  technologies: ['TypeScript', 'PostgreSQL'],
  languages: ['English'],
  workAuthorization: 'EU citizen',
  authorizedCountries: ['Germany'],
  sponsorshipRequired: false,
  sponsorshipAcceptable: true,
  relocationPreference: 'Open within EU',
  minimumJobScore: 70,
  tailorThreshold: 80,
  autoApplyThreshold: 90,
  coverLettersRequired: true,
  prioritizeReferrals: true,
  dailyApplicationLimit: 10,
  dailyOutreachLimit: 20,
  automationMode: 'SAFE_MODE',
  timezone: 'Europe/Berlin',
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as CandidateProfile;

const job = {
  id: 'job-1',
  title: 'Senior Backend Engineer',
  company: 'Example GmbH',
  location: 'Berlin',
  country: 'Germany',
  countryNormalized: 'germany',
  remoteType: 'REMOTE',
  employmentType: 'FULL_TIME',
  seniority: 'SENIOR',
  description: 'TypeScript and PostgreSQL.',
  requiredSkills: ['typescript'],
} as unknown as Job;

const resume = {
  id: 'resume-1',
  profileId: 'profile-1',
  rawText: 'Experience 2019-2026',
  structured: { summary: '', experience: [], skills: [], projects: [], education: [], certifications: [], languages: [], achievements: [] },
} as unknown as Resume;

describe('application question safety', () => {
  it('marks protected and legal questions as sensitive', () => {
    expect(isSensitiveQuestion('Do you have a disability?')).toBe(true);
    expect(isSensitiveQuestion('Have you ever been convicted of a felony?')).toBe(true);
    expect(isSensitiveQuestion('What are your salary expectations?')).toBe(true);
    expect(isSensitiveQuestion('Are you authorized to work in Germany?')).toBe(true);
    expect(isSensitiveQuestion('What is your notice period?')).toBe(false);
  });

  it('answers years of experience from evidence', () => {
    const answer = heuristicAnswer('How many years of professional experience do you have?', profile, resume, job);
    expect(answer.answer).toBe('7');
    expect(answer.status).toBe('ANSWERED');
    expect(answer.source).toContain('candidate_profile');
  });

  it('flags compensation commitments for human review', () => {
    const answer = heuristicAnswer('What are your salary expectations?', profile, resume, job);
    expect(answer.status).toBe('HUMAN_REVIEW');
    expect(answer.sensitive).toBe(true);
    expect(answer.answer).toContain('EUR');
  });

  it('never guesses a notice period', () => {
    const answer = heuristicAnswer('What is your notice period?', profile, resume, job);
    expect(answer.status).toBe('HUMAN_REVIEW');
    expect(answer.answer).toBe('');
    expect(answer.source).toBe('insufficient_evidence');
  });

  it('does not claim a skill that is absent from the profile', () => {
    const answer = heuristicAnswer('Describe your experience with Terraform.', profile, resume, job);
    expect(answer.status).toBe('HUMAN_REVIEW');
    expect(answer.answer).toBe('');
  });

  it('answers sponsorship from the profile', () => {
    const answer = heuristicAnswer('Do you require visa sponsorship?', profile, resume, job);
    expect(answer.answer).toBe('No');
    expect(answer.status).toBe('ANSWERED');
  });
});
