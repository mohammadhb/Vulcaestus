# Architecture

## 1. Services and boundaries

```
Browser (you)
   │  HTML + same-origin /api/* rewrite
   ▼
Next.js web (:3000) ──────────────► Fastify API (:4000) ──────► PostgreSQL
                                          │  ▲                    │
                                          │  │                    └── Prisma
                                          ▼  │
                                   Ollama (:11434)
                                          │
                                          ▼
                              Playwright worker (:4100) ──────► external sites
                                          │
                                          └── shared ./storage + ./browser/profiles

n8n (:5678) ── service key ──► /api/internal/*
```

- The browser never talks to the API cross-origin in production. Next rewrites `/api/*` to the
  API container, so the session cookie is first-party.
- Server components call the API with `API_INTERNAL_URL` and forward cookies explicitly.
- n8n never uses a user password; it uses `SERVICE_API_KEY` on internal endpoints.
- The worker never touches the database. It receives an action, performs it, and posts a result
  to `/api/internal/browser-actions/:id/callback`.

## 2. Data model (high level)

| Domain | Tables |
|---|---|
| Identity | `User`, `Session`, `AuditLog` |
| Candidate | `CandidateProfile`, `Resume` |
| Jobs | `JobSource`, `Job`, `JobScore` |
| Documents | `TailoredResume`, `CoverLetter` |
| Applications | `Application`, `ApplicationAnswer`, `BrowserAction` |
| Outreach | `Contact`, `OutreachMessage`, `FollowUp` |
| Human loop | `ApprovalRequest` |
| Interviews | `Interview` |
| Operations | `AiGeneration`, `DailyCounter`, `Notification`, `WebhookEvent`, `Prompt`, `Setting`, `AiProviderConfig`, `BatchRun` |

All primary keys are UUIDs. Private records carry `profileId`. Jobs are private to a profile,
with per-profile deduplication; `Application` is unique per `(jobId, profileId)`. Job sources
are deployment-wide (admin-managed), while discovery writes into the requesting user's catalog.
Archive (`archivedAt`) and delete (`deletedAt`) are reversible, per-user states.

Indexes cover the common dashboard queries: job discovery date, company, title, score, approval
status/type, application status, outreach status, follow-up due date, and audit time.

## 3. Job ingestion and deduplication

1. A source adapter returns `JobInput` objects.
2. `normalizeJobInput`:
   - trims/canonicalizes company and title
   - strips tracking parameters from URLs
   - detects work mode, employment type, seniority, skills, years, salary, sponsorship
   - computes a fingerprint from `company|title|location`
3. `ingestJob` checks, in order, **within the owning profile's catalog**:
   - source + external id
   - canonical URL
   - fingerprint
   - title Jaccard similarity ≥ 0.82 for the same company (with a location guard)
4. Existing records are enriched (longer description, missing URL/skills/salary) instead of duplicated.
5. A concurrent insert race is handled by catching the unique violation and returning the winner.
6. A `DailyCounter` increments per profile for discovery.
7. Jobs are private to `profileId`. Two users can hold the same posting independently, with separate scores, archives, and applications. Job sources remain deployment-wide.

This makes repeated workflow runs idempotent.

## 4. Scoring

Deterministic scoring runs first and always produces:

- technical, experience, seniority, location, salary, authorization, industry, preference
- evidence-derived `strongMatches`, `missingRequirements`, `risks`
- an overall weighted score and recommendation from profile thresholds

If AI is available, its subscores and reasoning may refine the result, but:

- missing/strong matches are recomputed deterministically
- exclusions force `REJECT`
- the recommendation is recalculated from configured thresholds

Model, prompt version, and timestamp are stored on `JobScore`; the raw generation is stored in
`AiGeneration`.

## 5. Resume tailoring

The prompt receives the structured resume, raw text, profile, and job. The response is validated
with Zod and then sanitized:

- experience entries are dropped unless the company/role exists in the master
- skills are filtered to the candidate's evidenced skills
- technologies on achievements are filtered to the evidence set
- numeric metrics must appear in the source text
- a summary containing unsupported numbers is replaced
- education, certifications, and languages come from the source, not the model

The result is stored with the master resume id, job id, model, prompt version, change notes, and
blocked additions. PDF/DOCX/Markdown are generated on demand from stored markdown.

## 6. Application answers

Questions come from the prepared package or from a browser-captured form. Each answer has:

- `question`
- `answer`
- `source` (e.g. `candidate_profile.yearsExperience`, `resume.experience`, `insufficient_evidence`)
- `status` (`ANSWERED` or `HUMAN_REVIEW`)
- `sensitive` flag

Sensitive categories always require human review: criminal history, disability, veteran status,
protected characteristics, health, immigration/legal declarations, and compensation commitments.
Unknown or unverifiable questions are never guessed.

## 7. Approval lifecycle

```
PENDING ──approve──► APPROVED ──► dispatch
   │                    │
   ├─reject──► REJECTED │
   ├─expire──► EXPIRED  │
   └─cancel──► CANCELLED│
                        ├─ DRY_RUN → BrowserAction SIMULATED
                        └─ live    → BrowserAction QUEUED/RUNNING
                                         ├─ SUCCEEDED → SUBMITTED / SENT-ready
                                         ├─ AWAITING_HUMAN → HUMAN_ACTION approval
                                         └─ FAILED → visible error + notification
```

The gate (`evaluateApprovalGate`) requires the approval to be `APPROVED`, of the correct type, for
the same entity, and unexpired. It is enforced in the approval service and again in the browser
dispatch path.

Bulk approval explicitly skips `APPLICATION_SUBMISSION` and `HUMAN_ACTION`.

## 8. Browser worker

- Single-process queue with configurable concurrency and per-profile locks.
- Persistent Chromium context per profile id.
- Each action returns `SUCCEEDED`, `FAILED`, `AWAITING_HUMAN`, or `SIMULATED`.
- Screenshots are written to `./storage/browser-actions/<action>/<n>.png`; the API serves them only
  to the owning profile.
- Worker callback is retried three times; the database record is authoritative.
- No CAPTCHA solving, stealth, or bypass. Detection returns a human-action approval.

Form filling strategy:

1. `getByLabel`
2. `getByPlaceholder`
3. side-effect-free name selector
4. visible-context token matching
5. required-field DOM check before submission

If any mapped field or required field is missing, the action stops before clicking submit.

## 9. Idempotency and failure handling

- Job ingestion: unique fingerprint/canonical URL + race-safe duplicate lookup.
- Application preparation: unique `(jobId, profileId)` upsert.
- Approvals: conditional `updateMany` on `PENDING`.
- Webhooks: unique `eventId`; processed events return `{duplicate:true}`.
- Browser actions: state transitions are recorded; callbacks are retried.
- n8n HTTP nodes: retries and timeouts.
- AI calls: bounded attempts, schema validation, deterministic fallback.
- Limits are checked before dispatch; counters are incremented after success.

## 10. Observability

- Fastify logs structured JSON with redaction of cookies/keys.
- Worker logs action id, kind, and outcome.
- `/health` is liveness; `/ready` checks the database.
- `AuditLog` is user-facing activity; `AiGeneration` is model provenance.
- `Notification` stores every attempted delivery and its error.

## 11. Local development

```bash
pnpm install
pnpm --filter @vulcaestus/db generate
pnpm --filter @vulcaestus/db migrate:dev
pnpm --filter @vulcaestus/types build && pnpm --filter @vulcaestus/ai build && pnpm --filter @vulcaestus/db build
# Postgres + Ollama must be reachable; or run `docker compose up -d postgres redis ollama`
pnpm dev
```

The web app expects the API at `http://localhost:4000` in development.
