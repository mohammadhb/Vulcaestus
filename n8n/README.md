# n8n workflows

These workflows are the orchestration layer. They call the API's internal endpoints with
`x-api-key: $VULCAESTUS_SERVICE_KEY`.

| File | Purpose | Trigger |
|---|---|---|
| `01-job-discovery.json` | Pull enabled job sources and deduplicate | Every 6 hours |
| `02-job-scoring.json` | Score jobs without a score for the profile | Every 2 hours |
| `03-resume-tailoring.json` | Generate tailored resumes above the tailor threshold | Every 4 hours |
| `04-referral-discovery.json` | Rank known contacts for matching companies | Daily |
| `05-application-preparation.json` | Prepare applications for strong matches | Every 4 hours |
| `06-application-browser-agent.json` | Retry failed browser actions with valid approvals | Every 30 minutes |
| `07-followups.json` | Generate due follow-ups and approvals | Daily |
| `08-interview-preparation.json` | Brief interviews in the next 72 hours | Hourly |
| `09-analytics.json` | Send a daily summary notification | Daily |

## Import

### UI

1. Open http://localhost:5678 and create the owner account.
2. **Workflows → Import from File** and select each JSON file.
3. Activate only the workflows you want.

### CLI

```bash
make workflows-install
```

or:

```bash
docker compose exec n8n n8n import:workflow --separate --input=/workflows
```

## Required n8n environment

The compose file already sets:

- `VULCAESTUS_API_URL=http://api:4000`
- `VULCAESTUS_SERVICE_KEY=<SERVICE_API_KEY>`
- `VULCAESTUS_WEBHOOK_SECRET=<WEBHOOK_SECRET>` (for future webhook-triggered flows)
- `VULCAESTUS_DEFAULT_PROFILE_ID=<profile uuid>` (optional; required when multiple users exist)
- `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` so expressions can read `$env`

Find your profile id:

```bash
curl -s http://localhost:4000/api/auth/me -H "Cookie: vulcaestus_session=..." | jq .profile.id
```

or copy it from the response in the browser developer tools after login.

## Webhooks available to n8n

All webhooks require `x-webhook-secret: $WEBHOOK_SECRET` and are idempotent by `eventId`
(or `x-event-id`).

- `POST /api/webhooks/job-created` — `{ job: JobInput, profileId? }`
- `POST /api/webhooks/job-approved` — `{ jobId, profileId? }` (scores)
- `POST /api/webhooks/application-approved` — `{ approvalId }` or `{ applicationId }`
- `POST /api/webhooks/linkedin-message-approved` — `{ approvalId | entityId }`
- `POST /api/webhooks/referral-approved` — `{ approvalId | entityId }`
- `POST /api/webhooks/followup-approved` — `{ approvalId | entityId }`
- `POST /api/webhooks/human-action-complete` — `{ approvalId }`

Prefer the dashboard for approvals. These hooks exist for automation that already has a
trusted, explicit decision.

## Failure handling

Every HTTP node has retries with backoff and a 120s timeout. The API is idempotent for job
ingestion, application creation, approvals, and webhook events, so a retried workflow will
not create duplicate records.
