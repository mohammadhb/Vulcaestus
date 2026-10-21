# Build a Self-Hosted AI Job Application & LinkedIn Outreach Platform

You are a senior full-stack engineer, automation engineer, DevOps engineer, and AI-agent architect.

Build a production-quality, self-hosted application that automates my job search, job matching, resume tailoring, application preparation, referral discovery, LinkedIn outreach preparation, application tracking, and follow-ups.

The system must run on my own server using Docker Compose. Personal data, resumes, application history, and generated messages must remain self-hosted unless I explicitly configure an external AI/API provider.

Do not merely provide an architecture or examples. Actually implement the project, create all required files, Docker configuration, database schema, backend, frontend, n8n workflows, prompts, documentation, and tests.

---

# 1. PRIMARY OBJECTIVE

Build a private "Job Search Agent" with this workflow:

Job discovery
→ job normalization
→ duplicate detection
→ job scoring
→ candidate/job matching
→ resume tailoring
→ cover-letter generation
→ application-question generation
→ referral/contact discovery
→ personalized LinkedIn message generation
→ human approval
→ browser-assisted application
→ application tracking
→ follow-ups
→ interview preparation
→ analytics

The system must be designed around human approval for external actions.

The AI may prepare actions automatically, but external messages and application submissions must require explicit approval by default.

---

# 2. TECHNOLOGY STACK

Use:

Frontend:
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui or another clean component library
- Responsive desktop-first UI

Backend:
- TypeScript
- Node.js
- REST API
- PostgreSQL
- Prisma ORM

Automation:
- n8n
- n8n should be the workflow/orchestration layer

AI:
- Ollama
- Support configurable local models
- Default model should be configurable through environment variables
- Structure AI responses as JSON whenever possible

Browser automation:
- Playwright
- Chromium
- Separate browser-worker container/service
- Persistent browser profiles
- Never store plaintext passwords in the database

Infrastructure:
- Docker Compose
- PostgreSQL
- Redis if needed
- n8n
- Ollama
- Playwright worker
- Next.js application

Optional:
- MinIO for document/object storage

All services must be independently restartable.

---

# 3. REPOSITORY STRUCTURE

Create something similar to:

job-agent/
├── apps/
│   ├── web/
│   ├── api/
│   └── browser-worker/
├── n8n/
│   ├── workflows/
│   └── README.md
├── packages/
│   ├── database/
│   ├── types/
│   └── ai/
├── prisma/
│   └── schema.prisma
├── prompts/
│   ├── job-scoring.md
│   ├── resume-tailoring.md
│   ├── cover-letter.md
│   ├── referral.md
│   ├── linkedin-message.md
│   ├── application-questions.md
│   └── interview-preparation.md
├── browser/
├── scripts/
├── docker-compose.yml
├── .env.example
├── README.md
└── Makefile

You may improve this structure if there is a better engineering approach.

---

# 4. USER PROFILE

Create a profile management system.

The user must be able to enter:

Personal:
- name
- email
- phone
- location
- LinkedIn URL
- GitHub URL
- portfolio URL

Job preferences:
- target titles
- alternative titles
- target countries
- target cities
- remote/hybrid/on-site preference
- minimum salary
- preferred salary
- currency
- employment type
- seniority
- industries
- companies to prioritize
- companies to exclude
- technologies
- languages

Work authorization:
- current authorization
- countries where authorized
- sponsorship required
- sponsorship acceptable
- relocation preference

Application preferences:
- minimum job score
- automatic tailoring threshold
- automatic application threshold
- whether cover letters are required
- whether referrals should be prioritized
- daily application limit
- daily outreach limit

---

# 5. MASTER RESUME SYSTEM

Allow the user to upload/import:

- PDF resume
- DOCX resume
- Markdown resume
- plain text resume

Store a structured canonical profile in PostgreSQL.

Break the resume into:

- summary
- experience
- achievements
- skills
- projects
- education
- certifications
- languages

Every achievement should optionally contain:

- title
- description
- technologies
- metrics
- dates
- company
- role

The AI must NEVER invent experience, technologies, achievements, employers, education, certifications, or metrics.

The tailoring engine may reorder, rewrite, shorten, and emphasize existing information only.

---

# 6. JOB DISCOVERY

Create an n8n workflow called:

01-job-discovery

It should run on a schedule.

Design the system around pluggable job sources.

Each source should produce:

{
  title,
  company,
  location,
  remoteType,
  salary,
  description,
  requirements,
  url,
  source,
  externalId,
  discoveredAt
}

Support configurable sources.

Do not hard-code credentials.

Use official APIs where available.

For browser-based sources, use Playwright.

Respect robots.txt, rate limits, authentication requirements, and website terms. Do not implement CAPTCHA bypassing, anti-bot bypassing, stealth fingerprinting, or other mechanisms intended to defeat website protections.

---

# 7. JOB NORMALIZATION

Normalize every job into a common schema.

Extract:

- title
- company
- location
- remote policy
- employment type
- seniority
- salary
- required skills
- preferred skills
- years of experience
- education requirements
- language requirements
- visa/sponsorship information
- responsibilities
- application URL
- source

Store the original job description.

---

# 8. DUPLICATE DETECTION

Detect duplicates using:

1. external job ID
2. canonical URL
3. company + title + location
4. semantic similarity where necessary

Never create duplicate application records for the same underlying job.

---

# 9. JOB SCORING

Create:

02-job-scoring

For each job, calculate:

- overallScore
- technicalScore
- experienceScore
- seniorityScore
- locationScore
- salaryScore
- authorizationScore
- industryScore
- preferenceScore

Return structured JSON.

Example:

{
  "overallScore": 92,
  "recommendation": "APPLY",
  "technicalScore": 96,
  "experienceScore": 91,
  "seniorityScore": 95,
  "locationScore": 100,
  "salaryScore": 85,
  "authorizationScore": 100,
  "missingRequirements": [
    "Terraform"
  ],
  "strongMatches": [
    "Java",
    "Spring Boot",
    "AWS",
    "Kubernetes"
  ],
  "reasoning": "..."
}

Recommendations:

90-100 = STRONG APPLY
80-89 = APPLY
70-79 = REVIEW
60-69 = LOW PRIORITY
<60 = REJECT

Make thresholds configurable.

---

# 10. RESUME TAILORING

Create:

03-resume-tailoring

Input:

- master resume
- candidate profile
- job description
- job score

Generate:

- tailored resume
- ATS-friendly version
- cover letter
- application summary
- application questions/answers

Rules:

- Never fabricate experience.
- Never add technologies the candidate does not have.
- Never fabricate metrics.
- Never claim qualifications not present in the source profile.
- Prefer truthful keyword alignment.
- Preserve factual accuracy.
- Make changes traceable.

Store:

- original resume version
- generated version
- job ID
- model
- prompt version
- generation timestamp

Allow the user to compare:

MASTER RESUME vs TAILORED RESUME

with highlighted changes.

---

# 11. DOCUMENT GENERATION

Generate:

- PDF
- DOCX
- Markdown

Use a consistent professional resume template.

The UI should allow:

- preview
- download
- regenerate
- edit
- approve

---

# 12. REFERRAL DISCOVERY

Create:

04-referral-discovery

For each high-scoring job:

Identify potential contacts associated with the company.

Categorize:

- hiring manager
- recruiter
- engineering manager
- team member
- alumni
- former colleague
- mutual connection
- second-degree connection

Rank contacts.

Example:

{
  "relevanceScore": 91,
  "relationship": "2nd degree",
  "reason": "Works in the same backend engineering organization"
}

Do not fabricate relationships.

Do not claim a mutual connection unless verified.

---

# 13. LINKEDIN OUTREACH

Create a message generation system.

Message types:

- connection request
- referral request
- recruiter outreach
- hiring manager outreach
- follow-up
- thank-you
- post-interview follow-up

Messages must be:

- concise
- personalized
- factual
- non-spammy
- based on available evidence

Do not generate deceptive claims.

Do not pretend the candidate knows someone when they do not.

Store every generated message.

---

# 14. APPROVAL INBOX

This is a critical feature.

Build a dedicated approval UI.

The dashboard should contain:

Pending Applications
Pending LinkedIn Messages
Pending Referral Requests
Pending Follow-ups
Pending Interview Actions

Example:

--------------------------------------------------
APPROVAL QUEUE

LinkedIn Referral Request

Sarah Müller
Senior Engineering Manager
Example GmbH

Reason:
Works in the target engineering organization.

Message:

"Hi Sarah, I noticed you're working on..."

[ Edit ]
[ Regenerate ]
[ Reject ]
[ Approve & Send ]

--------------------------------------------------

The user must be able to:

- approve
- reject
- edit
- regenerate
- postpone
- bulk approve selected safe actions

Every approval must be recorded.

Database:

approval_requests

Fields:

id
type
entityId
status
content
createdAt
approvedAt
rejectedAt
approvedBy
metadata

Statuses:

PENDING
APPROVED
REJECTED
EXPIRED
CANCELLED

---

# 15. APPLICATION APPROVAL

Create a separate approval screen for applications.

Show:

- company
- job
- match score
- salary
- location
- tailored resume
- cover letter
- application answers
- missing requirements
- potential risks
- application URL

Buttons:

[Approve Application]
[Edit]
[Reject]
[Save for Later]

Do not submit an application without explicit approval unless the user has globally enabled automatic submission for that specific category.

---

# 16. BROWSER AUTOMATION

Create a Playwright browser worker.

The worker should support:

- open page
- navigate
- fill inputs
- select dropdowns
- upload files
- click buttons
- extract application questions
- detect successful submission
- capture confirmation
- screenshot on failure

The worker communicates with n8n/API through a secure internal interface.

Use persistent browser profiles.

Do not store passwords in PostgreSQL.

Do not bypass CAPTCHA or anti-bot systems.

If CAPTCHA, unusual authentication, or another human-only challenge appears:

STOP

and create:

HUMAN_ACTION_REQUIRED

in the approval queue.

---

# 17. APPLICATION FORM INTELLIGENCE

When an application asks questions:

Example:

"How many years of Java experience do you have?"

The AI should retrieve the candidate's structured profile.

Generate:

{
  "answer": "7",
  "source": "candidate_profile.experience"
}

Every answer should have a source.

If the answer cannot be confidently determined:

status = HUMAN_REVIEW

Never guess.

For sensitive questions involving:

- legal declarations
- criminal history
- disability
- protected characteristics
- immigration/legal declarations
- compensation commitments

require human review.

---

# 18. APPLICATION TRACKER

Create statuses:

DISCOVERED
SHORTLISTED
TAILORING
READY_FOR_APPROVAL
APPROVED
APPLYING
SUBMITTED
RECRUITER_SCREEN
INTERVIEW
FINAL_ROUND
OFFER
REJECTED
WITHDRAWN
ARCHIVED

Dashboard:

Applications this week
Applications this month
Response rate
Interview rate
Offer rate
Applications by source
Applications by company
Applications by role
Referral conversion
Average job score
Average response time

---

# 19. FOLLOW-UP AUTOMATION

Create:

07-followups

Examples:

Application submitted
→ wait configurable number of days
→ check status
→ generate follow-up
→ approval
→ send

Referral request
→ wait
→ generate follow-up
→ approval

Recruiter conversation
→ detect inactivity
→ create follow-up

Never send repeated messages automatically without respecting configurable limits.

---

# 20. INTERVIEW PREPARATION

When an interview is scheduled:

Research:

- company
- role
- team
- technology
- recent company developments
- likely technical topics
- likely behavioral topics

Generate:

- company briefing
- role briefing
- likely questions
- STAR examples from the candidate's actual experience
- technical preparation
- questions to ask interviewer

Never invent company facts.

---

# 21. AI PROMPT MANAGEMENT

Store prompts as versioned files.

Every AI generation must record:

- model
- prompt version
- input references
- output
- timestamp

Allow prompts to be edited through configuration.

---

# 22. OLLAMA

Create an Ollama service.

Environment:

OLLAMA_MODEL=qwen...

The model must be configurable.

Create an AI abstraction layer so the system can later support:

- Ollama
- OpenAI
- Anthropic
- other providers

Default to Ollama.

---

# 23. N8N WORKFLOWS

Create actual importable n8n JSON workflows:

01-job-discovery.json
02-job-scoring.json
03-resume-tailoring.json
04-referral-discovery.json
05-application-preparation.json
06-application-browser-agent.json
07-followups.json
08-interview-preparation.json
09-analytics.json

Do not merely describe these workflows.

They must be valid n8n workflow JSON that can be imported.

Use environment variables for:

- database
- n8n
- Ollama
- API
- browser worker
- notification provider

---

# 24. N8N WEBHOOKS

Create API/webhook endpoints for:

POST /webhooks/job-created
POST /webhooks/job-approved
POST /webhooks/application-approved
POST /webhooks/linkedin-message-approved
POST /webhooks/referral-approved
POST /webhooks/followup-approved
POST /webhooks/human-action-complete

Secure webhook endpoints.

Do not expose internal services publicly.

---

# 25. NOTIFICATIONS

Support at least:

- email
- Telegram

Notify me when:

- high-quality job discovered
- application ready
- LinkedIn message ready
- referral found
- human intervention required
- application submitted
- interview detected
- follow-up due

---

# 26. DASHBOARD

Build a polished dashboard.

Pages:

/dashboard
/jobs
/jobs/:id
/applications
/applications/:id
/approvals
/approvals/linkedin
/approvals/applications
/contacts
/outreach
/resume
/profile
/interviews
/analytics
/settings

Dashboard cards:

Jobs Found Today
Strong Matches
Applications Pending
Messages Pending
Applications Submitted
Interviews
Offers

---

# 27. APPROVAL UI DETAILS

The LinkedIn approval page must feel like an inbox.

Filters:

- all
- connection requests
- referral requests
- recruiters
- hiring managers
- follow-ups
- high priority

Each item should show:

- person
- title
- company
- relationship
- related job
- match score
- reason for outreach
- generated message
- source/evidence
- created time

Actions:

Approve & Send
Edit
Regenerate
Reject
Schedule
Skip

Allow keyboard shortcuts if practical.

---

# 28. SECURITY

Implement:

- authentication
- secure sessions
- password hashing
- CSRF protection where applicable
- rate limiting
- input validation
- encrypted secrets where appropriate
- least-privilege service accounts
- no credentials committed to Git
- .env.example without secrets

Add a SECURITY.md.

---

# 29. AUDIT LOG

Every important action must be logged:

- job discovered
- score generated
- resume generated
- message generated
- approval
- rejection
- browser action
- application submitted
- follow-up sent

Include:

timestamp
user
action
entity
result
metadata

---

# 30. ERROR HANDLING

Every workflow must have:

- retries
- timeout
- failure state
- structured logs
- error notification
- idempotency

If a workflow runs twice, it must not duplicate:

- jobs
- applications
- messages
- outreach
- submissions

---

# 31. HUMAN-IN-THE-LOOP DESIGN

Never silently perform external communication.

Default:

AI prepares → human approves → automation executes.

For browser automation:

If anything unexpected occurs:

STOP.

Create human-action-required event.

Never attempt to bypass website security mechanisms.

---

# 32. DOCKER COMPOSE

Create a complete docker-compose.yml containing:

- frontend
- API
- PostgreSQL
- n8n
- Ollama
- browser-worker
- Redis if required
- MinIO if required

Use persistent volumes.

Include health checks.

Use an internal Docker network.

Only expose required ports.

---

# 33. ENVIRONMENT VARIABLES

Create .env.example containing all configuration.

Example:

POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=

N8N_ENCRYPTION_KEY=

OLLAMA_BASE_URL=
OLLAMA_MODEL=

API_URL=
WEB_URL=

TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

EMAIL_HOST=
EMAIL_PORT=
EMAIL_USER=
EMAIL_PASSWORD=

BROWSER_WORKER_URL=

Do not put real credentials into the repository.

---

# 34. DATABASE

Create a complete Prisma schema.

Use UUIDs.

Add proper indexes.

Use foreign keys.

Use timestamps.

Use soft deletion where appropriate.

Include migrations.

---

# 35. TESTING

Implement:

Unit tests
Integration tests
API tests
AI parser tests
Job scoring tests
Duplicate detection tests
Approval tests
Browser-worker tests
n8n workflow validation where practical

Create realistic fixtures.

Test that duplicate job discovery does not create duplicate records.

Test that an unapproved LinkedIn message cannot be sent.

Test that an unapproved application cannot be submitted.

Test that sensitive/unknown application questions trigger human review.

---

# 36. OBSERVABILITY

Provide:

- structured JSON logs
- health endpoints
- workflow execution logging
- browser-worker logs
- AI request logging without exposing secrets

Endpoints:

GET /health
GET /ready

---

# 37. SETUP EXPERIENCE

The README must provide exact instructions:

1. Clone repository
2. Copy .env.example to .env
3. Configure credentials
4. Start Docker Compose
5. Run migrations
6. Pull Ollama model
7. Import n8n workflows
8. Create admin account
9. Create candidate profile
10. Upload master resume
11. Configure job sources
12. Configure browser profile
13. Test with dry-run mode
14. Enable approval mode
15. Begin production use

---

# 38. DRY-RUN MODE

This is mandatory.

When:

DRY_RUN=true

the system must:

- discover jobs
- score jobs
- generate resumes
- generate messages
- simulate browser interactions

but NEVER:

- send messages
- submit applications

Display simulated actions in the dashboard.

---

# 39. AUTOMATION MODES

Implement:

SAFE_MODE

Every external action requires approval.

ASSISTED_MODE

Low-risk repetitive actions can execute automatically, but messages and submissions require approval.

AUTONOMOUS_MODE

Only explicitly configured action categories can execute automatically.

The default must be SAFE_MODE.

---

# 40. DAILY LIMITS

Implement configurable limits:

maxJobsPerDay
maxApplicationsPerDay
maxLinkedInConnectionsPerDay
maxMessagesPerDay
maxFollowupsPerDay

Stop automation when limits are reached.

---

# 41. IMPORTANT DATA PRINCIPLE

The candidate's master profile is the source of truth.

The AI cannot invent facts.

Every generated claim should be traceable to:

- profile
- resume
- experience
- project
- job description

If there is insufficient evidence:

HUMAN_REVIEW

---

# 42. IMPLEMENTATION PROCESS

Do the implementation in phases.

Phase 1:
- repository
- Docker
- PostgreSQL
- Prisma
- API
- frontend
- authentication

Phase 2:
- candidate profile
- resume management
- job database
- job discovery

Phase 3:
- Ollama
- job scoring
- resume tailoring

Phase 4:
- approval inbox
- application preparation

Phase 5:
- Playwright browser worker

Phase 6:
- referral/contact workflow
- LinkedIn message approval workflow

Phase 7:
- follow-ups
- interviews
- analytics

Phase 8:
- tests
- security
- documentation
- production hardening

After each phase, run tests and fix errors before proceeding.

---

# 43. DEFINITION OF DONE

The project is complete only when I can run:

docker compose up -d

and access the dashboard.

I should then be able to:

1. Create my candidate profile.
2. Upload my master resume.
3. Configure target roles.
4. Discover jobs.
5. See job scores.
6. Open a job.
7. Generate a tailored resume.
8. Generate a cover letter.
9. Generate application answers.
10. Find potential referral contacts.
11. Generate a personalized LinkedIn message.
12. See the message in an approval inbox.
13. Edit the message.
14. Approve the message.
15. Have the browser worker execute the approved action.
16. Track the result.
17. Approve an application.
18. Have Playwright fill the application.
19. Pause when human input is required.
20. Submit after approval.
21. Track the application.
22. Automatically generate follow-ups.
23. Prepare interview briefs.
24. View analytics.

Everything must be self-hostable.

Do not give me pseudocode where executable code/configuration is expected.

Do not leave TODO placeholders for core functionality.

When a third-party integration cannot be safely or reliably automated, implement the integration boundary and human-review fallback instead of pretending it works.

At the end, provide:

- exact setup commands
- required environment variables
- default credentials/setup process
- architecture diagram
- workflow documentation
- list of implemented features
- known limitations
- security considerations
- testing instructions
- instructions for adding new job sources
- instructions for adding new AI models
- instructions for adding new browser automation targets