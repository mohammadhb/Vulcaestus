import type { CandidateProfile, Job, JobScore, Resume } from '@vulcaestus/db';
import { prisma } from '@vulcaestus/db';
import {
  jobScoreSchema,
  normalizeCompany,
  recommendationFor,
  type JobScoreResult,
  type StructuredResume,
} from '@vulcaestus/types';
import { runAiJson } from '../ai.js';
import { canonicalSkill } from './normalize.js';

const SENIORITY_RANK: Record<string, number> = {
  INTERN: 0,
  JUNIOR: 1,
  MID: 2,
  SENIOR: 3,
  LEAD: 4,
  STAFF: 4,
  PRINCIPAL: 5,
  DIRECTOR: 6,
  EXECUTIVE: 7,
  UNKNOWN: -1,
};

export interface ScoringProfile {
  yearsExperience: number | null;
  targetTitles: string[];
  alternativeTitles: string[];
  targetCountries: string[];
  targetCities: string[];
  remotePreference: string;
  minimumSalary: number | null;
  preferredSalary: number | null;
  currency: string;
  employmentTypes: string[];
  seniority: string;
  industries: string[];
  priorityCompanies: string[];
  excludedCompanies: string[];
  technologies: string[];
  languages: string[];
  workAuthorization: string | null;
  authorizedCountries: string[];
  sponsorshipRequired: boolean;
  sponsorshipAcceptable: boolean;
  relocationPreference: string | null;
  minimumJobScore: number;
  tailorThreshold: number;
  autoApplyThreshold: number;
}

export interface ScoringJob {
  title: string;
  company: string;
  location: string | null;
  country?: string | null;
  remoteType: string;
  employmentType: string;
  seniority: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  requiredSkills: string[];
  preferredSkills: string[];
  yearsExperience: number | null;
  visaSponsorship: boolean | null;
  industry: string | null;
  languageRequirements: string[];
  description: string;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function includesText(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function profileToScoringProfile(profile: CandidateProfile): ScoringProfile {
  return {
    yearsExperience: profile.yearsExperience,
    targetTitles: profile.targetTitles,
    alternativeTitles: profile.alternativeTitles,
    targetCountries: profile.targetCountries,
    targetCities: profile.targetCities,
    remotePreference: profile.remotePreference,
    minimumSalary: profile.minimumSalary,
    preferredSalary: profile.preferredSalary,
    currency: profile.currency,
    employmentTypes: profile.employmentTypes,
    seniority: profile.seniority,
    industries: profile.industries,
    priorityCompanies: profile.priorityCompanies,
    excludedCompanies: profile.excludedCompanies,
    technologies: profile.technologies,
    languages: profile.languages,
    workAuthorization: profile.workAuthorization,
    authorizedCountries: profile.authorizedCountries,
    sponsorshipRequired: profile.sponsorshipRequired,
    sponsorshipAcceptable: profile.sponsorshipAcceptable,
    relocationPreference: profile.relocationPreference,
    minimumJobScore: profile.minimumJobScore,
    tailorThreshold: profile.tailorThreshold,
    autoApplyThreshold: profile.autoApplyThreshold,
  };
}

export function jobToScoringJob(job: Job): ScoringJob {
  return {
    title: job.title,
    company: job.company,
    location: job.location,
    country: job.country,
    remoteType: job.remoteType,
    employmentType: job.employmentType,
    seniority: job.seniority,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    currency: job.currency,
    requiredSkills: job.requiredSkills,
    preferredSkills: job.preferredSkills,
    yearsExperience: job.yearsExperience,
    visaSponsorship: job.visaSponsorship,
    industry: job.industry,
    languageRequirements: job.languageRequirements,
    description: job.description,
  };
}

export function collectCandidateSkills(
  profile: Pick<CandidateProfile, 'technologies'> | ScoringProfile,
  resume?: StructuredResume | null,
): string[] {
  const skills = new Set<string>();
  for (const skill of profile.technologies) skills.add(canonicalSkill(skill));
  if (resume) {
    for (const skill of resume.skills ?? []) {
      if (typeof skill === 'string') skills.add(canonicalSkill(skill));
      else if (skill?.name) skills.add(canonicalSkill(skill.name));
    }
    for (const experience of resume.experience ?? []) {
      for (const skill of experience.technologies ?? []) skills.add(canonicalSkill(skill));
    }
    for (const project of resume.projects ?? []) {
      for (const skill of project.technologies ?? []) skills.add(canonicalSkill(skill));
    }
  }
  return [...skills].filter(Boolean);
}

export function estimateYearsExperience(profile: ScoringProfile, resume?: StructuredResume | null): number | null {
  if (profile.yearsExperience !== null && profile.yearsExperience !== undefined) {
    return profile.yearsExperience;
  }
  if (!resume) return null;
  let earliest: Date | null = null;
  for (const experience of resume.experience ?? []) {
    const start = experience.startDate?.match(/((?:19|20)\d{2})/);
    if (!start?.[1]) continue;
    const date = new Date(Number(start[1]), 0, 1);
    if (!earliest || date < earliest) earliest = date;
  }
  if (!earliest) return null;
  return Math.max(0, Math.round(((Date.now() - earliest.getTime()) / (365.25 * 24 * 3600 * 1000)) * 10) / 10);
}

export function computeDeterministicScore(
  profile: ScoringProfile,
  job: ScoringJob,
  candidateSkills: string[],
  resume?: StructuredResume | null,
): JobScoreResult {
  const candidateSet = new Set(candidateSkills.map(canonicalSkill));
  const required = job.requiredSkills.map(canonicalSkill);
  const preferred = job.preferredSkills.map(canonicalSkill).filter((skill) => !required.includes(skill));

  const strongMatches = required.filter((skill) => candidateSet.has(skill));
  const missingRequirements = required.filter((skill) => !candidateSet.has(skill));
  const preferredMatches = preferred.filter((skill) => candidateSet.has(skill));

  const excluded = profile.excludedCompanies.some(
    (company) => normalizeCompany(company) === normalizeCompany(job.company),
  );

  const technicalScore =
    required.length > 0
      ? clamp((strongMatches.length / required.length) * 90 + (preferred.length ? (preferredMatches.length / preferred.length) * 10 : 10))
      : candidateSet.size > 0
        ? clamp(55 + (strongMatches.length > 0 ? 10 : 0))
        : 50;

  const candidateYears = estimateYearsExperience(profile, resume);
  let experienceScore = 75;
  if (job.yearsExperience !== null && job.yearsExperience !== undefined) {
    if (candidateYears === null) experienceScore = 60;
    else if (candidateYears >= job.yearsExperience) experienceScore = 100;
    else experienceScore = clamp(100 - (job.yearsExperience - candidateYears) * 18);
  } else if (candidateYears !== null) {
    experienceScore = 80;
  }

  const candidateRank = SENIORITY_RANK[profile.seniority] ?? -1;
  const jobRank = SENIORITY_RANK[job.seniority] ?? -1;
  let seniorityScore = 75;
  if (candidateRank >= 0 && jobRank >= 0) {
    const difference = jobRank - candidateRank;
    if (difference === 0) seniorityScore = 100;
    else if (difference === 1) seniorityScore = 82;
    else if (difference === 2) seniorityScore = 55;
    else if (difference > 2) seniorityScore = 30;
    else if (difference === -1) seniorityScore = 70;
    else seniorityScore = 45;
  }

  const locationText = `${job.location ?? ''} ${job.country ?? ''}`.toLowerCase();
  const cityMatch = profile.targetCities.some((city) => locationText.includes(city.toLowerCase()));
  const countryMatch =
    profile.targetCountries.some((country) => includesText(locationText, country)) ||
    (job.country ? profile.authorizedCountries.some((country) => includesText(job.country ?? '', country)) : false);

  let locationScore = 65;
  if (job.remoteType === 'REMOTE') {
    locationScore =
      profile.remotePreference === 'REMOTE'
        ? 100
        : profile.remotePreference === 'HYBRID'
          ? 85
          : 65;
  } else if (job.remoteType === 'HYBRID') {
    locationScore =
      profile.remotePreference === 'HYBRID' ? 100 : profile.remotePreference === 'REMOTE' ? 80 : cityMatch ? 75 : 55;
  } else if (job.remoteType === 'ONSITE') {
    if (cityMatch) locationScore = 100;
    else if (countryMatch) locationScore = 82;
    else if (profile.relocationPreference && /yes|willing|open|maybe/i.test(profile.relocationPreference)) locationScore = 70;
    else locationScore = 35;
  }

  let salaryScore = 70;
  const salaryMin = job.salaryMin;
  const salaryMax = job.salaryMax ?? job.salaryMin;
  const currencyKnown = !job.currency || job.currency.toUpperCase() === profile.currency.toUpperCase();
  if (salaryMax !== null && salaryMax !== undefined && currencyKnown) {
    if (profile.minimumSalary !== null && salaryMax < profile.minimumSalary) {
      salaryScore = clamp(20 + (salaryMax / Math.max(1, profile.minimumSalary)) * 25);
    } else if (profile.preferredSalary !== null && (salaryMin ?? salaryMax) >= profile.preferredSalary) {
      salaryScore = 100;
    } else if (profile.minimumSalary !== null && salaryMax >= profile.minimumSalary) {
      salaryScore = 85;
    } else {
      salaryScore = 70;
    }
  }

  let authorizationScore = 65;
  if (job.country && profile.authorizedCountries.some((country) => includesText(job.country ?? '', country))) {
    authorizationScore = 100;
  } else if (profile.sponsorshipRequired) {
    if (job.visaSponsorship === true) authorizationScore = 92;
    else if (job.visaSponsorship === false) authorizationScore = 15;
    else authorizationScore = 50;
  } else if (job.visaSponsorship === false && profile.sponsorshipAcceptable) {
    authorizationScore = 80;
  } else if (profile.workAuthorization && /citizen|permanent|unrestricted/i.test(profile.workAuthorization)) {
    authorizationScore = 65;
  }

  const industryScore = job.industry
    ? profile.industries.some((industry) => includesText(job.industry ?? '', industry))
      ? 100
      : 55
    : 65;

  const titleText = `${job.title} ${job.description.slice(0, 500)}`.toLowerCase();
  const targetTitleMatch = [...profile.targetTitles, ...profile.alternativeTitles].some((title) =>
    titleText.includes(title.toLowerCase()),
  );
  const priorityCompany = profile.priorityCompanies.some(
    (company) => normalizeCompany(company) === normalizeCompany(job.company),
  );
  const languageMatch = profile.languages.some((language) =>
    job.languageRequirements.some((required) => includesText(required, language)),
  );
  let preferenceScore = 55;
  if (targetTitleMatch) preferenceScore += 25;
  if (priorityCompany) preferenceScore += 15;
  if (languageMatch) preferenceScore += 5;
  if (
    profile.employmentTypes.length > 0 &&
    job.employmentType !== 'UNKNOWN' &&
    !profile.employmentTypes.includes(job.employmentType)
  ) {
    preferenceScore -= 15;
  }
  preferenceScore = clamp(preferenceScore);

  const overallScore = clamp(
    technicalScore * 0.3 +
      experienceScore * 0.15 +
      seniorityScore * 0.1 +
      locationScore * 0.1 +
      salaryScore * 0.1 +
      authorizationScore * 0.1 +
      industryScore * 0.05 +
      preferenceScore * 0.1,
  );

  const risks: string[] = [];
  if (missingRequirements.length > 0) {
    risks.push(`Missing evidenced skills: ${missingRequirements.slice(0, 6).join(', ')}`);
  }
  if (job.yearsExperience && candidateYears !== null && candidateYears < job.yearsExperience) {
    risks.push(`Job asks for ${job.yearsExperience} years; profile evidences ${candidateYears}.`);
  }
  if (job.visaSponsorship === false && profile.sponsorshipRequired) {
    risks.push('No visa sponsorship indicated, but sponsorship is required.');
  }
  if (salaryMax !== null && profile.minimumSalary !== null && salaryMax < profile.minimumSalary) {
    risks.push('Posted salary range is below the configured minimum.');
  }
  if (profile.remotePreference === 'ONSITE' && job.remoteType === 'REMOTE') {
    risks.push('Role is remote but on-site work is preferred.');
  }

  const finalOverall = excluded ? 0 : overallScore;
  const recommendation = excluded
    ? 'REJECT'
    : recommendationFor(finalOverall, {
        minimum: profile.minimumJobScore,
        tailor: profile.tailorThreshold,
        autoApply: profile.autoApplyThreshold,
      });

  const parts: string[] = [];
  parts.push(
    required.length > 0
      ? `Matches ${strongMatches.length}/${required.length} required skills.`
      : 'No explicit required-skill list was available in the posting.',
  );
  if (candidateYears !== null) {
    parts.push(`Profile evidences about ${candidateYears} years of experience.`);
  }
  parts.push(
    job.remoteType !== 'UNKNOWN' ? `Work mode is ${job.remoteType.toLowerCase()}.` : 'Work mode is not stated.',
  );
  if (excluded) parts.push('Company is on the exclusion list.');

  return {
    overallScore: finalOverall,
    technicalScore,
    experienceScore,
    seniorityScore,
    locationScore,
    salaryScore,
    authorizationScore,
    industryScore,
    preferenceScore,
    recommendation,
    missingRequirements,
    strongMatches,
    risks,
    reasoning: parts.join(' '),
  };
}

function normalizeScorePayload(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const object = { ...(value as Record<string, unknown>) };
  for (const key of [
    'overallScore',
    'technicalScore',
    'experienceScore',
    'seniorityScore',
    'locationScore',
    'salaryScore',
    'authorizationScore',
    'industryScore',
    'preferenceScore',
  ]) {
    const raw = object[key];
    if (typeof raw === 'string') {
      const numeric = Number(raw.replace(/[^0-9.]/g, ''));
      if (Number.isFinite(numeric)) object[key] = numeric;
    }
  }

  const recommendation = String(object.recommendation ?? '')
    .toUpperCase()
    .replace(/[^A-Z]+/g, '_');
  if (recommendation.includes('STRONG')) object.recommendation = 'STRONG_APPLY';
  else if (recommendation.includes('REJECT')) object.recommendation = 'REJECT';
  else if (recommendation.includes('LOW')) object.recommendation = 'LOW_PRIORITY';
  else if (recommendation.includes('REVIEW')) object.recommendation = 'REVIEW';
  else if (recommendation.includes('APPLY')) object.recommendation = 'APPLY';

  for (const key of ['missingRequirements', 'strongMatches', 'risks']) {
    const raw = object[key];
    if (typeof raw === 'string') {
      object[key] = raw
        .split(/\n|,|;/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  if (object.reasoning !== undefined && typeof object.reasoning !== 'string') {
    object.reasoning = String(object.reasoning);
  }
  return object;
}

export async function scoreJobForProfile(
  profile: CandidateProfile,
  job: Job,
  resume?: Resume | null,
): Promise<JobScore> {  const scoringProfile = profileToScoringProfile(profile);
  const structured = (resume?.structured ?? null) as StructuredResume | null;
  const candidateSkills = collectCandidateSkills(scoringProfile, structured);
  const deterministic = computeDeterministicScore(
    scoringProfile,
    jobToScoringJob(job),
    candidateSkills,
    structured,
  );

  const ai = await runAiJson({
    kind: 'JOB_SCORING',
    promptName: 'job-scoring',
    entityType: 'job',
    entityId: job.id,
    inputRefs: { jobId: job.id, profileId: profile.id, resumeId: resume?.id },
    schema: jobScoreSchema,
    normalize: normalizeScorePayload,
    maxTokens: 1600,
    variables: {
      candidate: {
        title: profile.targetTitles,
        seniority: profile.seniority,
        yearsExperience: profile.yearsExperience,
        location: profile.location,
        remotePreference: profile.remotePreference,
        targetCountries: profile.targetCountries,
        authorizedCountries: profile.authorizedCountries,
        sponsorshipRequired: profile.sponsorshipRequired,
        minimumSalary: profile.minimumSalary,
        preferredSalary: profile.preferredSalary,
        currency: profile.currency,
        industries: profile.industries,
        technologies: profile.technologies,
        languages: profile.languages,
      },
      candidateSkills,
      job: {
        title: job.title,
        company: job.company,
        location: job.location,
        remoteType: job.remoteType,
        employmentType: job.employmentType,
        seniority: job.seniority,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        currency: job.currency,
        requiredSkills: job.requiredSkills,
        preferredSkills: job.preferredSkills,
        yearsExperience: job.yearsExperience,
        visaSponsorship: job.visaSponsorship,
        industry: job.industry,
        description: job.description.slice(0, 9000),
      },
    },
    system:
      'You are a job matching engine. Never invent candidate evidence. Return only valid JSON matching the requested schema.',
  });

  let result = deterministic;
  let model = 'deterministic';
  let promptVersion = 'deterministic';

  if (ai) {
    const merged: JobScoreResult = {
      overallScore: clamp(ai.data.overallScore),
      technicalScore: ai.data.technicalScore ?? deterministic.technicalScore,
      experienceScore: ai.data.experienceScore ?? deterministic.experienceScore,
      seniorityScore: ai.data.seniorityScore ?? deterministic.seniorityScore,
      locationScore: ai.data.locationScore ?? deterministic.locationScore,
      salaryScore: ai.data.salaryScore ?? deterministic.salaryScore,
      authorizationScore: ai.data.authorizationScore ?? deterministic.authorizationScore,
      industryScore: ai.data.industryScore ?? deterministic.industryScore,
      preferenceScore: ai.data.preferenceScore ?? deterministic.preferenceScore,
      recommendation: ai.data.recommendation,
      // Evidence-derived fields are always computed; the model may not invent matches.
      missingRequirements: deterministic.missingRequirements,
      strongMatches: deterministic.strongMatches,
      risks: [...new Set([...deterministic.risks, ...(ai.data.risks ?? [])])].slice(0, 12),
      reasoning: ai.data.reasoning || deterministic.reasoning,
    };

    // Recompute the overall score from the model's subscores using the same weights
    // as the deterministic engine, then blend. If the model is wildly inconsistent
    // with the evidence-based result, discard it rather than trusting a hallucination.
    const weightedFromSubscores = clamp(
      merged.technicalScore * 0.3 +
        merged.experienceScore * 0.15 +
        merged.seniorityScore * 0.1 +
        merged.locationScore * 0.1 +
        merged.salaryScore * 0.1 +
        merged.authorizationScore * 0.1 +
        merged.industryScore * 0.05 +
        merged.preferenceScore * 0.1,
    );
    const blended = clamp(merged.overallScore * 0.4 + weightedFromSubscores * 0.6);
    const excluded = profile.excludedCompanies.some(
      (company) => normalizeCompany(company) === normalizeCompany(job.company),
    );

    if (excluded) {
      merged.overallScore = 0;
      merged.recommendation = 'REJECT';
      merged.reasoning = `${merged.reasoning} Company is on the exclusion list.`;
      result = merged;
      model = ai.model;
      promptVersion = ai.promptVersion;
    } else if (Math.abs(blended - deterministic.overallScore) > 20) {
      // Keep the deterministic assessment and its reasoning. The generation remains
      // in AiGeneration for inspection, but a divergent model does not override evidence.
      result = deterministic;
      model = 'deterministic-guard';
      promptVersion = ai.promptVersion;
    } else {
      merged.overallScore = blended;
      merged.recommendation = recommendationFor(merged.overallScore, {
        minimum: profile.minimumJobScore,
        tailor: profile.tailorThreshold,
        autoApply: profile.autoApplyThreshold,
      });
      result = merged;
      model = ai.model;
      promptVersion = ai.promptVersion;
    }
  }

  return prisma.jobScore.create({
    data: {
      jobId: job.id,
      profileId: profile.id,
      overallScore: result.overallScore,
      technicalScore: result.technicalScore,
      experienceScore: result.experienceScore,
      seniorityScore: result.seniorityScore,
      locationScore: result.locationScore,
      salaryScore: result.salaryScore,
      authorizationScore: result.authorizationScore,
      industryScore: result.industryScore,
      preferenceScore: result.preferenceScore,
      recommendation: result.recommendation,
      missingRequirements: result.missingRequirements,
      strongMatches: result.strongMatches,
      risks: result.risks,
      reasoning: result.reasoning,
      model,
      promptVersion,
    },
  });
}
