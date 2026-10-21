export type Role = 'ADMIN' | 'USER';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  disabled?: boolean;
  createdAt?: string;
  lastLoginAt?: string | null;
}

export interface Profile {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  location: string | null;
  country: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  headline: string | null;
  summary: string | null;
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
  coverLettersRequired: boolean;
  prioritizeReferrals: boolean;
  dailyApplicationLimit: number;
  dailyOutreachLimit: number;
  automationMode: string;
  timezone: string;
}

export interface Me {
  user: User;
  profile: Profile | null;
  dryRun: boolean;
  permissions: { admin: boolean };
}

export interface JobScore {
  id: string;
  jobId: string;
  overallScore: number;
  technicalScore: number;
  experienceScore: number;
  seniorityScore: number;
  locationScore: number;
  salaryScore: number;
  authorizationScore: number;
  industryScore: number;
  preferenceScore: number;
  recommendation: string;
  missingRequirements: string[];
  strongMatches: string[];
  risks: string[];
  reasoning: string;
  model: string;
  promptVersion: string;
  createdAt: string;
}

export interface Job {
  id: string;
  profileId: string;
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
  description: string;
  requirements: string[];
  responsibilities: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  yearsExperience: number | null;
  visaSponsorship: boolean | null;
  industry: string | null;
  url: string | null;
  source: string;
  externalId?: string | null;
  discoveredAt: string;
  archivedAt?: string | null;
  deletedAt?: string | null;
  postedAt?: string | null;
  scores?: JobScore[];
  applications?: Application[];
  tailoredResumes?: TailoredResume[];
  coverLetters?: CoverLetter[];
  contacts?: Contact[];
  outreach?: OutreachMessage[];
}

export interface BatchRun {
  id: string;
  profileId: string;
  kind: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';
  total: number;
  processed: number;
  failed: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TailoredResume {
  id: string;
  jobId: string;
  contentMarkdown: string;
  atsMarkdown: string;
  contentJson: Record<string, unknown>;
  diff: Record<string, unknown>;
  status: string;
  model: string;
  promptVersion: string;
  createdAt: string;
}

export interface CoverLetter {
  id: string;
  jobId: string;
  content: string;
  status: string;
  model: string;
  createdAt: string;
}

export interface Application {
  id: string;
  jobId: string;
  status: string;
  scoreAtApply: number | null;
  tailoredResumeId: string | null;
  coverLetterId: string | null;
  applicationUrl: string | null;
  submittedAt: string | null;
  confirmationRef: string | null;
  lastActivityAt: string;
  notes: string | null;
  createdAt: string;
  job?: Job;
  answers?: ApplicationAnswer[];
  humanReviewCount?: number;
  followUps?: FollowUp[];
  interviews?: Interview[];
  browserActions?: BrowserAction[];
}

export interface ApplicationAnswer {
  id: string;
  question: string;
  answer: string;
  source: string;
  status: string;
  sensitive: boolean;
}

export interface ApprovalRequest {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  status: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  priority: number;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  expiresAt: string | null;
  decisionNote?: string | null;
}

export interface Contact {
  id: string;
  company: string;
  name: string;
  title: string | null;
  linkedinUrl: string | null;
  email: string | null;
  category: string;
  relationship: string | null;
  relevanceScore: number;
  reason: string | null;
  source: string;
  verified: boolean;
  notes: string | null;
  jobId: string | null;
  createdAt: string;
  job?: { id: string; title: string; company: string } | null;
}

export interface OutreachMessage {
  id: string;
  contactId: string;
  jobId: string | null;
  applicationId: string | null;
  type: string;
  subject: string | null;
  body: string;
  status: string;
  model: string;
  evidence: Record<string, unknown>;
  dryRun: boolean;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
  contact?: Contact;
  job?: { id: string; title: string; company: string } | null;
}

export interface Resume {
  id: string;
  name: string;
  isMaster: boolean;
  originalFilename: string | null;
  sourceFormat: string | null;
  structured: {
    summary?: string;
    experience?: Array<{
      company: string;
      role: string;
      startDate?: string;
      endDate?: string;
      achievements?: Array<{ description: string; metrics?: string[]; technologies?: string[] }>;
    }>;
    skills?: Array<{ name: string } | string>;
  };
  createdAt: string;
  updatedAt: string;
}

export interface FollowUp {
  id: string;
  applicationId: string | null;
  outreachId: string | null;
  jobId: string | null;
  type: string;
  dueAt: string;
  status: string;
  message: string | null;
  attempts: number;
  sentAt: string | null;
  createdAt: string;
  application?: Application;
  outreach?: OutreachMessage;
}

export interface Interview {
  id: string;
  applicationId: string;
  jobId: string;
  stage: string;
  scheduledAt: string;
  interviewer: string | null;
  location: string | null;
  notes: string | null;
  briefing: Record<string, unknown>;
  job?: Job;
  application?: Application;
}

export interface BrowserAction {
  id: string;
  kind: string;
  status: string;
  dryRun: boolean;
  request: Record<string, unknown>;
  result: Record<string, unknown>;
  screenshots: string[];
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface AnalyticsSummary {
  cards: {
    jobsFoundToday: number;
    strongMatches: number;
    applicationsPending: number;
    messagesPending: number;
    applicationsSubmitted: number;
    interviews: number;
    offers: number;
    humanActionsRequired: number;
  };
  rates: {
    responseRate: number;
    interviewRate: number;
    offerRate: number;
    referralConversion: number;
    averageJobScore: number | null;
    averageResponseDays: number | null;
  };
  periods: {
    applicationsThisWeek: number;
    applicationsThisMonth: number;
    submittedThisWeek: number;
    submittedThisMonth: number;
  };
  bySource: Array<{ label: string; count: number }>;
  byCompany: Array<{ label: string; count: number }>;
  byRole: Array<{ label: string; count: number }>;
  pipeline: Record<string, number>;
  pendingApprovals: Record<string, number>;
  scores: {
    total: number;
    distribution: Record<string, number>;
  };
  upcomingInterviews: Array<{
    id: string;
    stage: string;
    scheduledAt: string;
    company: string;
    title: string;
    hasBriefing: boolean;
  }>;
  daily: Array<{
    date: string;
    jobsDiscovered: number;
    applicationsSubmitted: number;
    messagesSent: number;
    followupsSent: number;
  }>;
  today: {
    date: string;
    jobsDiscovered: number;
    applicationsSubmitted: number;
    connectionsSent: number;
    messagesSent: number;
    followupsSent: number;
  };
}
