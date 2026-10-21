import { z } from 'zod';

export const REMOTE_TYPES = ['REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN'] as const;
export const EMPLOYMENT_TYPES = [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'TEMPORARY',
  'INTERNSHIP',
  'FREELANCE',
  'UNKNOWN',
] as const;
export const SENIORITIES = [
  'INTERN',
  'JUNIOR',
  'MID',
  'SENIOR',
  'STAFF',
  'PRINCIPAL',
  'LEAD',
  'DIRECTOR',
  'EXECUTIVE',
  'UNKNOWN',
] as const;
export const RECOMMENDATIONS = [
  'STRONG_APPLY',
  'APPLY',
  'REVIEW',
  'LOW_PRIORITY',
  'REJECT',
] as const;
export const APPLICATION_STATUSES = [
  'DISCOVERED',
  'SHORTLISTED',
  'TAILORING',
  'READY_FOR_APPROVAL',
  'APPROVED',
  'APPLYING',
  'SUBMITTED',
  'RECRUITER_SCREEN',
  'INTERVIEW',
  'FINAL_ROUND',
  'OFFER',
  'REJECTED',
  'WITHDRAWN',
  'ARCHIVED',
] as const;
export const APPROVAL_TYPES = [
  'APPLICATION_SUBMISSION',
  'LINKEDIN_MESSAGE',
  'REFERRAL_REQUEST',
  'FOLLOWUP',
  'INTERVIEW_ACTION',
  'HUMAN_ACTION',
] as const;
export const MESSAGE_TYPES = [
  'CONNECTION_REQUEST',
  'REFERRAL_REQUEST',
  'RECRUITER_OUTREACH',
  'HIRING_MANAGER_OUTREACH',
  'FOLLOW_UP',
  'THANK_YOU',
  'POST_INTERVIEW_FOLLOW_UP',
] as const;
export const CONTACT_CATEGORIES = [
  'HIRING_MANAGER',
  'RECRUITER',
  'ENGINEERING_MANAGER',
  'TEAM_MEMBER',
  'ALUMNI',
  'FORMER_COLLEAGUE',
  'MUTUAL_CONNECTION',
  'SECOND_DEGREE',
  'OTHER',
] as const;
export const JOB_SOURCE_KINDS = [
  'MANUAL',
  'GREENHOUSE',
  'LEVER',
  'REMOTIVE',
  'RSS',
  'ASHBY',
  'WORKABLE',
  'SERPAPI_GOOGLE',
  'INDEED_PARTNER',
  'ZIPRECRUITER_PARTNER',
  'LINKEDIN_MANUAL',
] as const;
export const AI_PROVIDER_KINDS = [
  'OLLAMA',
  'OPENAI',
  'ANTHROPIC',
  'OPENROUTER',
  'OPENCODE',
  'CUSTOM_OPENAI',
] as const;

export type RemoteType = (typeof REMOTE_TYPES)[number];
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export type Seniority = (typeof SENIORITIES)[number];
export type Recommendation = (typeof RECOMMENDATIONS)[number];
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export type MessageType = (typeof MESSAGE_TYPES)[number];
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export const profileInputSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(80).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  country: z.string().max(120).nullable().optional(),
  linkedinUrl: z.string().url().nullable().optional().or(z.literal('')),
  githubUrl: z.string().url().nullable().optional().or(z.literal('')),
  portfolioUrl: z.string().url().nullable().optional().or(z.literal('')),
  headline: z.string().max(300).nullable().optional(),
  summary: z.string().max(10000).nullable().optional(),
  yearsExperience: z.number().min(0).max(70).nullable().optional(),
  targetTitles: z.array(z.string().min(1)).max(50).default([]),
  alternativeTitles: z.array(z.string().min(1)).max(50).default([]),
  targetCountries: z.array(z.string().min(1)).max(50).default([]),
  targetCities: z.array(z.string().min(1)).max(50).default([]),
  remotePreference: z.enum(REMOTE_TYPES).default('REMOTE'),
  minimumSalary: z.number().int().min(0).nullable().optional(),
  preferredSalary: z.number().int().min(0).nullable().optional(),
  currency: z.string().min(3).max(3).default('EUR'),
  employmentTypes: z.array(z.string()).default([]),
  seniority: z.enum(SENIORITIES).default('UNKNOWN'),
  industries: z.array(z.string()).default([]),
  priorityCompanies: z.array(z.string()).default([]),
  excludedCompanies: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  workAuthorization: z.string().max(300).nullable().optional(),
  authorizedCountries: z.array(z.string()).default([]),
  sponsorshipRequired: z.boolean().default(false),
  sponsorshipAcceptable: z.boolean().default(true),
  relocationPreference: z.string().max(200).nullable().optional(),
  minimumJobScore: z.number().int().min(0).max(100).default(70),
  tailorThreshold: z.number().int().min(0).max(100).default(75),
  autoApplyThreshold: z.number().int().min(0).max(100).default(95),
  coverLettersRequired: z.boolean().default(true),
  prioritizeReferrals: z.boolean().default(true),
  dailyApplicationLimit: z.number().int().min(0).max(100).default(10),
  dailyOutreachLimit: z.number().int().min(0).max(200).default(20),
  automationMode: z.enum(['SAFE_MODE', 'ASSISTED_MODE', 'AUTONOMOUS_MODE']).default('SAFE_MODE'),
  timezone: z.string().default('Europe/Berlin'),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

export const jobInputSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  remoteType: z.enum(REMOTE_TYPES).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  seniority: z.enum(SENIORITIES).optional(),
  salaryMin: z.number().int().nullable().optional(),
  salaryMax: z.number().int().nullable().optional(),
  currency: z.string().nullable().optional(),
  description: z.string().min(1),
  requirements: z.array(z.string()).optional(),
  responsibilities: z.array(z.string()).optional(),
  requiredSkills: z.array(z.string()).optional(),
  preferredSkills: z.array(z.string()).optional(),
  yearsExperience: z.number().nullable().optional(),
  educationRequirement: z.string().nullable().optional(),
  languageRequirements: z.array(z.string()).optional(),
  visaSponsorship: z.boolean().nullable().optional(),
  industry: z.string().nullable().optional(),
  url: z.string().url().nullable().optional().or(z.literal('')),
  source: z.string().default('manual'),
  externalId: z.string().nullable().optional(),
  postedAt: z.coerce.date().nullable().optional(),
});

export type JobInput = z.infer<typeof jobInputSchema>;

const achievementSchema = z.object({
  title: z.string().optional(),
  description: z.string(),
  technologies: z.array(z.string()).default([]),
  metrics: z.array(z.string()).default([]),
  dates: z.string().optional(),
});

const experienceSchema = z.object({
  company: z.string(),
  role: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  location: z.string().optional(),
  summary: z.string().optional(),
  achievements: z.array(achievementSchema).default([]),
  technologies: z.array(z.string()).default([]),
});

const projectSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  technologies: z.array(z.string()).default([]),
  url: z.string().optional(),
  achievements: z.array(achievementSchema).default([]),
});

export const structuredResumeSchema = z.object({
  summary: z.string().default(''),
  headline: z.string().optional(),
  experience: z.array(experienceSchema).default([]),
  skills: z
    .union([
      z.array(
        z.object({
          name: z.string(),
          category: z.string().optional(),
          level: z.string().optional(),
        }),
      ),
      z.array(z.string()),
    ])
    .default([]),
  projects: z.array(projectSchema).default([]),
  education: z
    .array(
      z.object({
        institution: z.string(),
        degree: z.string().optional(),
        field: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        location: z.string().optional(),
      }),
    )
    .default([]),
  certifications: z
    .array(
      z.object({
        name: z.string(),
        issuer: z.string().optional(),
        date: z.string().optional(),
      }),
    )
    .default([]),
  languages: z
    .array(
      z.object({
        name: z.string(),
        level: z.string().optional(),
      }),
    )
    .default([]),
  achievements: z.array(achievementSchema).default([]),
});

export type StructuredResume = z.infer<typeof structuredResumeSchema>;

export const jobScoreSchema = z.object({
  overallScore: z.number().min(0).max(100),
  technicalScore: z.number().min(0).max(100).default(0),
  experienceScore: z.number().min(0).max(100).default(0),
  seniorityScore: z.number().min(0).max(100).default(0),
  locationScore: z.number().min(0).max(100).default(0),
  salaryScore: z.number().min(0).max(100).default(0),
  authorizationScore: z.number().min(0).max(100).default(0),
  industryScore: z.number().min(0).max(100).default(0),
  preferenceScore: z.number().min(0).max(100).default(0),
  recommendation: z.enum(RECOMMENDATIONS),
  missingRequirements: z.array(z.string()).default([]),
  strongMatches: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  reasoning: z.string().default(''),
});

export type JobScoreResult = z.infer<typeof jobScoreSchema>;

export const tailoredResumeSchema = z.object({
  summary: z.string(),
  experience: z.array(experienceSchema),
  skills: z.array(z.string()).default([]),
  education: z.array(z.record(z.unknown())).default([]),
  certifications: z.array(z.record(z.unknown())).default([]),
  languages: z.array(z.record(z.unknown())).default([]),
  coverLetter: z.string().default(''),
  applicationSummary: z.string().default(''),
  changeNotes: z.array(z.string()).default([]),
});

export type TailoredResumeResult = z.infer<typeof tailoredResumeSchema>;

export const generatedAnswerSchema = z.object({
  question: z.string(),
  answer: z.string(),
  source: z.string(),
  confident: z.boolean().default(false),
  sensitive: z.boolean().default(false),
});

export type GeneratedAnswer = z.infer<typeof generatedAnswerSchema>;

export const generatedMessageSchema = z.object({
  body: z.string().min(1).max(3000),
  subject: z.string().max(200).optional(),
  evidence: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export type GeneratedMessage = z.infer<typeof generatedMessageSchema>;

export const contactInputSchema = z.object({
  company: z.string().min(1),
  name: z.string().min(1),
  title: z.string().nullable().optional(),
  linkedinUrl: z.string().url().nullable().optional().or(z.literal('')),
  email: z.string().email().nullable().optional().or(z.literal('')),
  category: z.enum(CONTACT_CATEGORIES).default('OTHER'),
  relationship: z.string().max(300).nullable().optional(),
  reason: z.string().max(3000).nullable().optional(),
  verified: z.boolean().default(false),
  source: z.string().default('manual'),
  notes: z.string().max(3000).nullable().optional(),
  jobId: z.string().uuid().nullable().optional(),
});

export const interviewBriefingSchema = z.object({
  companyBriefing: z.string().default(''),
  roleBriefing: z.string().default(''),
  likelyQuestions: z.array(z.string()).default([]),
  starExamples: z
    .array(
      z.object({
        question: z.string(),
        situation: z.string(),
        task: z.string(),
        action: z.string(),
        result: z.string(),
        sourceAchievement: z.string().optional(),
      }),
    )
    .default([]),
  technicalPreparation: z.array(z.string()).default([]),
  questionsToAsk: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export type InterviewBriefing = z.infer<typeof interviewBriefingSchema>;

export const providerConfigSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(AI_PROVIDER_KINDS),
  baseUrl: z.string().url().nullable().optional().or(z.literal('')),
  model: z.string().min(1).max(200),
  apiKey: z.string().max(500).nullable().optional(),
  enabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  settings: z.record(z.unknown()).default({}),
});

export const RECOMMENDATION_LABELS: Record<(typeof RECOMMENDATIONS)[number], string> = {
  STRONG_APPLY: 'Strong apply',
  APPLY: 'Apply',
  REVIEW: 'Review',
  LOW_PRIORITY: 'Low priority',
  REJECT: 'Reject',
};

export function recommendationFor(
  overallScore: number,
  thresholds: { minimum: number; tailor: number; autoApply: number },
): (typeof RECOMMENDATIONS)[number] {
  if (overallScore >= thresholds.autoApply) return 'STRONG_APPLY';
  if (overallScore >= thresholds.tailor) return 'APPLY';
  if (overallScore >= thresholds.minimum) return 'REVIEW';
  if (overallScore >= Math.max(60, thresholds.minimum - 10)) return 'LOW_PRIORITY';
  return 'REJECT';
}

export function normalizeCompany(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(gmbh|inc|llc|ltd|limited|corp|corporation|ag|sa|sas|bv|plc|co)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    const remove = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term',
      'gh_src',
      'lever-source',
      'ref',
      'source',
      'trackingId',
    ];
    remove.forEach((key) => url.searchParams.delete(key));
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    let pathname = url.pathname.replace(/\/+$/, '');
    if (pathname === '') pathname = '/';
    url.pathname = pathname;
    return url.toString();
  } catch {
    return value.trim();
  }
}
