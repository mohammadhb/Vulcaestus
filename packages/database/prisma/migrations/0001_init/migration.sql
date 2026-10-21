-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "AutomationMode" AS ENUM ('SAFE_MODE', 'ASSISTED_MODE', 'AUTONOMOUS_MODE');

-- CreateEnum
CREATE TYPE "RemoteType" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP', 'FREELANCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Seniority" AS ENUM ('INTERN', 'JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL', 'LEAD', 'DIRECTOR', 'EXECUTIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "JobSourceKind" AS ENUM ('MANUAL', 'GREENHOUSE', 'LEVER', 'REMOTIVE', 'RSS', 'ASHBY', 'WORKABLE', 'SERPAPI_GOOGLE', 'INDEED_PARTNER', 'ZIPRECRUITER_PARTNER', 'LINKEDIN_MANUAL');

-- CreateEnum
CREATE TYPE "Recommendation" AS ENUM ('STRONG_APPLY', 'APPLY', 'REVIEW', 'LOW_PRIORITY', 'REJECT');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DISCOVERED', 'SHORTLISTED', 'TAILORING', 'READY_FOR_APPROVAL', 'APPROVED', 'APPLYING', 'SUBMITTED', 'RECRUITER_SCREEN', 'INTERVIEW', 'FINAL_ROUND', 'OFFER', 'REJECTED', 'WITHDRAWN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('APPLICATION_SUBMISSION', 'LINKEDIN_MESSAGE', 'REFERRAL_REQUEST', 'FOLLOWUP', 'INTERVIEW_ACTION', 'HUMAN_ACTION');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('CONNECTION_REQUEST', 'REFERRAL_REQUEST', 'RECRUITER_OUTREACH', 'HIRING_MANAGER_OUTREACH', 'FOLLOW_UP', 'THANK_YOU', 'POST_INTERVIEW_FOLLOW_UP');

-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContactCategory" AS ENUM ('HIRING_MANAGER', 'RECRUITER', 'ENGINEERING_MANAGER', 'TEAM_MEMBER', 'ALUMNI', 'FORMER_COLLEAGUE', 'MUTUAL_CONNECTION', 'SECOND_DEGREE', 'OTHER');

-- CreateEnum
CREATE TYPE "GenerationKind" AS ENUM ('RESUME_STRUCTURE', 'JOB_SCORING', 'RESUME_TAILORING', 'COVER_LETTER', 'APPLICATION_ANSWERS', 'REFERRAL_DISCOVERY', 'LINKEDIN_MESSAGE', 'INTERVIEW_PREPARATION', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "AnswerStatus" AS ENUM ('ANSWERED', 'HUMAN_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('SCHEDULED', 'DUE', 'AWAITING_APPROVAL', 'SENT', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "BrowserActionStatus" AS ENUM ('QUEUED', 'RUNNING', 'AWAITING_HUMAN', 'SUCCEEDED', 'FAILED', 'SIMULATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BrowserActionKind" AS ENUM ('APPLICATION_SUBMIT', 'LINKEDIN_PREPARE', 'LINKEDIN_SEND', 'PAGE_CAPTURE');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'TELEGRAM', 'DASHBOARD');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DocumentFormat" AS ENUM ('PDF', 'DOCX', 'MARKDOWN');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AiProviderKind" AS ENUM ('OLLAMA', 'OPENAI', 'ANTHROPIC', 'OPENROUTER', 'OPENCODE', 'CUSTOM_OPENAI');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "location" TEXT,
    "country" TEXT,
    "linkedinUrl" TEXT,
    "githubUrl" TEXT,
    "portfolioUrl" TEXT,
    "headline" TEXT,
    "summary" TEXT,
    "yearsExperience" DOUBLE PRECISION,
    "targetTitles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "alternativeTitles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetCities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "remotePreference" "RemoteType" NOT NULL DEFAULT 'REMOTE',
    "minimumSalary" INTEGER,
    "preferredSalary" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "employmentTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seniority" "Seniority" NOT NULL DEFAULT 'UNKNOWN',
    "industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priorityCompanies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedCompanies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "technologies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "workAuthorization" TEXT,
    "authorizedCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sponsorshipRequired" BOOLEAN NOT NULL DEFAULT false,
    "sponsorshipAcceptable" BOOLEAN NOT NULL DEFAULT true,
    "relocationPreference" TEXT,
    "minimumJobScore" INTEGER NOT NULL DEFAULT 70,
    "tailorThreshold" INTEGER NOT NULL DEFAULT 75,
    "autoApplyThreshold" INTEGER NOT NULL DEFAULT 95,
    "coverLettersRequired" BOOLEAN NOT NULL DEFAULT true,
    "prioritizeReferrals" BOOLEAN NOT NULL DEFAULT true,
    "dailyApplicationLimit" INTEGER NOT NULL DEFAULT 10,
    "dailyOutreachLimit" INTEGER NOT NULL DEFAULT 20,
    "automationMode" "AutomationMode" NOT NULL DEFAULT 'SAFE_MODE',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isMaster" BOOLEAN NOT NULL DEFAULT false,
    "originalFilename" TEXT,
    "mimeType" TEXT,
    "rawText" TEXT NOT NULL,
    "structured" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceFormat" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSource" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "JobSourceKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "schedule" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" UUID NOT NULL,
    "sourceId" UUID,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "externalId" TEXT,
    "canonicalUrl" TEXT,
    "url" TEXT,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "companyNormalized" TEXT NOT NULL,
    "location" TEXT,
    "country" TEXT,
    "remoteType" "RemoteType" NOT NULL DEFAULT 'UNKNOWN',
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'UNKNOWN',
    "seniority" "Seniority" NOT NULL DEFAULT 'UNKNOWN',
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "currency" TEXT,
    "description" TEXT NOT NULL,
    "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "responsibilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "yearsExperience" DOUBLE PRECISION,
    "educationRequirement" TEXT,
    "languageRequirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visaSponsorship" BOOLEAN,
    "industry" TEXT,
    "postedAt" TIMESTAMP(3),
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fingerprint" TEXT NOT NULL,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobScore" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "technicalScore" INTEGER NOT NULL,
    "experienceScore" INTEGER NOT NULL,
    "seniorityScore" INTEGER NOT NULL,
    "locationScore" INTEGER NOT NULL,
    "salaryScore" INTEGER NOT NULL,
    "authorizationScore" INTEGER NOT NULL,
    "industryScore" INTEGER NOT NULL,
    "preferenceScore" INTEGER NOT NULL,
    "recommendation" "Recommendation" NOT NULL,
    "missingRequirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "strongMatches" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "risks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reasoning" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TailoredResume" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "masterResumeId" UUID,
    "profileId" UUID NOT NULL,
    "contentMarkdown" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL DEFAULT '{}',
    "atsMarkdown" TEXT NOT NULL,
    "diff" JSONB NOT NULL DEFAULT '{}',
    "status" "GenerationStatus" NOT NULL DEFAULT 'DRAFT',
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TailoredResume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverLetter" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'DRAFT',
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoverLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DISCOVERED',
    "scoreAtApply" INTEGER,
    "tailoredResumeId" UUID,
    "coverLetterId" UUID,
    "applicationUrl" TEXT,
    "submittedAt" TIMESTAMP(3),
    "confirmationRef" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationAnswer" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" "AnswerStatus" NOT NULL DEFAULT 'ANSWERED',
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "company" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "linkedinUrl" TEXT,
    "email" TEXT,
    "category" "ContactCategory" NOT NULL DEFAULT 'OTHER',
    "relationship" TEXT,
    "relevanceScore" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "jobId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachMessage" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "jobId" UUID,
    "applicationId" UUID,
    "type" "MessageType" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "OutreachStatus" NOT NULL DEFAULT 'DRAFT',
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "sentBy" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "type" "ApprovalType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "requestedBy" TEXT NOT NULL DEFAULT 'system',
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "applicationId" UUID,
    "outreachId" UUID,
    "jobId" UUID,
    "type" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'SCHEDULED',
    "message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "interviewer" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "briefing" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrowserAction" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "kind" "BrowserActionKind" NOT NULL,
    "status" "BrowserActionStatus" NOT NULL DEFAULT 'QUEUED',
    "jobId" UUID,
    "applicationId" UUID,
    "approvalId" UUID,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "request" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB NOT NULL DEFAULT '{}',
    "screenshots" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error" TEXT,
    "workerJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BrowserAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiGeneration" (
    "id" UUID NOT NULL,
    "kind" "GenerationKind" NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" UUID,
    "inputRefs" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB NOT NULL DEFAULT '{}',
    "outputText" TEXT,
    "latencyMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" UUID,
    "result" TEXT NOT NULL DEFAULT 'success',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCounter" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "jobsDiscovered" INTEGER NOT NULL DEFAULT 0,
    "applicationsSubmitted" INTEGER NOT NULL DEFAULT 0,
    "connectionsSent" INTEGER NOT NULL DEFAULT 0,
    "messagesSent" INTEGER NOT NULL DEFAULT 0,
    "followupsSent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prompt" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AiProviderConfig" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "AiProviderKind" NOT NULL,
    "baseUrl" TEXT,
    "model" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateProfile_userId_key" ON "CandidateProfile"("userId");

-- CreateIndex
CREATE INDEX "CandidateProfile_userId_idx" ON "CandidateProfile"("userId");

-- CreateIndex
CREATE INDEX "Resume_profileId_isMaster_idx" ON "Resume"("profileId", "isMaster");

-- CreateIndex
CREATE INDEX "Resume_profileId_createdAt_idx" ON "Resume"("profileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobSource_name_key" ON "JobSource"("name");

-- CreateIndex
CREATE INDEX "JobSource_enabled_idx" ON "JobSource"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "Job_canonicalUrl_key" ON "Job"("canonicalUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Job_fingerprint_key" ON "Job"("fingerprint");

-- CreateIndex
CREATE INDEX "Job_discoveredAt_idx" ON "Job"("discoveredAt");

-- CreateIndex
CREATE INDEX "Job_companyNormalized_idx" ON "Job"("companyNormalized");

-- CreateIndex
CREATE INDEX "Job_title_idx" ON "Job"("title");

-- CreateIndex
CREATE INDEX "Job_source_externalId_idx" ON "Job"("source", "externalId");

-- CreateIndex
CREATE INDEX "Job_deletedAt_idx" ON "Job"("deletedAt");

-- CreateIndex
CREATE INDEX "JobScore_jobId_createdAt_idx" ON "JobScore"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "JobScore_profileId_overallScore_idx" ON "JobScore"("profileId", "overallScore");

-- CreateIndex
CREATE INDEX "TailoredResume_jobId_createdAt_idx" ON "TailoredResume"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "CoverLetter_jobId_createdAt_idx" ON "CoverLetter"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "Application_profileId_status_idx" ON "Application"("profileId", "status");

-- CreateIndex
CREATE INDEX "Application_createdAt_idx" ON "Application"("createdAt");

-- CreateIndex
CREATE INDEX "Application_submittedAt_idx" ON "Application"("submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_jobId_profileId_key" ON "Application"("jobId", "profileId");

-- CreateIndex
CREATE INDEX "ApplicationAnswer_applicationId_idx" ON "ApplicationAnswer"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationAnswer_status_idx" ON "ApplicationAnswer"("status");

-- CreateIndex
CREATE INDEX "Contact_profileId_company_idx" ON "Contact"("profileId", "company");

-- CreateIndex
CREATE INDEX "Contact_jobId_idx" ON "Contact"("jobId");

-- CreateIndex
CREATE INDEX "Contact_relevanceScore_idx" ON "Contact"("relevanceScore");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_profileId_linkedinUrl_key" ON "Contact"("profileId", "linkedinUrl");

-- CreateIndex
CREATE INDEX "OutreachMessage_profileId_status_idx" ON "OutreachMessage"("profileId", "status");

-- CreateIndex
CREATE INDEX "OutreachMessage_createdAt_idx" ON "OutreachMessage"("createdAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_profileId_status_type_idx" ON "ApprovalRequest"("profileId", "status", "type");

-- CreateIndex
CREATE INDEX "ApprovalRequest_createdAt_idx" ON "ApprovalRequest"("createdAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_entityId_idx" ON "ApprovalRequest"("entityId");

-- CreateIndex
CREATE INDEX "FollowUp_profileId_status_dueAt_idx" ON "FollowUp"("profileId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "FollowUp_applicationId_idx" ON "FollowUp"("applicationId");

-- CreateIndex
CREATE INDEX "Interview_profileId_scheduledAt_idx" ON "Interview"("profileId", "scheduledAt");

-- CreateIndex
CREATE INDEX "BrowserAction_profileId_status_createdAt_idx" ON "BrowserAction"("profileId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BrowserAction_applicationId_idx" ON "BrowserAction"("applicationId");

-- CreateIndex
CREATE INDEX "AiGeneration_kind_createdAt_idx" ON "AiGeneration"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "AiGeneration_entityId_idx" ON "AiGeneration"("entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCounter_profileId_date_key" ON "DailyCounter"("profileId", "date");

-- CreateIndex
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Prompt_name_key" ON "Prompt"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderConfig_name_key" ON "AiProviderConfig"("name");

-- CreateIndex
CREATE INDEX "AiProviderConfig_provider_enabled_idx" ON "AiProviderConfig"("provider", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_eventId_key" ON "WebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "WebhookEvent_type_createdAt_idx" ON "WebhookEvent"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateProfile" ADD CONSTRAINT "CandidateProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobScore" ADD CONSTRAINT "JobScore_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobScore" ADD CONSTRAINT "JobScore_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TailoredResume" ADD CONSTRAINT "TailoredResume_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TailoredResume" ADD CONSTRAINT "TailoredResume_masterResumeId_fkey" FOREIGN KEY ("masterResumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TailoredResume" ADD CONSTRAINT "TailoredResume_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverLetter" ADD CONSTRAINT "CoverLetter_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverLetter" ADD CONSTRAINT "CoverLetter_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAnswer" ADD CONSTRAINT "ApplicationAnswer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_outreachId_fkey" FOREIGN KEY ("outreachId") REFERENCES "OutreachMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrowserAction" ADD CONSTRAINT "BrowserAction_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrowserAction" ADD CONSTRAINT "BrowserAction_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrowserAction" ADD CONSTRAINT "BrowserAction_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCounter" ADD CONSTRAINT "DailyCounter_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

