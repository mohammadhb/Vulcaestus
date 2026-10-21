# Security

This application handles personal data (resume, contact details, application history) and
controls actions on external websites. Treat it as sensitive infrastructure.

## Default posture

- All published ports are bound to `127.0.0.1`. Nothing is exposed to the LAN or internet by default.
- No default account or password. The first visitor creates the admin only while the user table is empty.
- `DRY_RUN=true` by default. The worker does not navigate or submit in dry-run mode.
- `SAFE_MODE` is the default automation mode. Every external action requires approval.
- LinkedIn is prepare-and-handoff. The worker never sends a message and never stores a password.
- CAPTCHAs, login walls, and unfamiliar required fields stop automation and create a human-action task.
- Generated claims are constrained to the master profile; tailoring filters unsupported companies,
  skills, and metrics.

## Authentication and sessions

- Passwords are hashed with bcrypt (cost 12).
- Sessions use a random 32-byte token. Only a SHA-256 hash is stored in PostgreSQL.
- The session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` when `WEB_URL` is HTTPS.
- Login is rate-limited (10 attempts/minute per IP).
- Disabling a user or resetting their password revokes their sessions.
- Users are isolated by `profileId` on every private query. Admin accounts manage users but do not
  automatically read other users' private pipeline data through the UI.

## Authorization

- `ADMIN` is required for user management, job sources, AI providers, prompts, and workspace settings.
- `USER` can manage only their own profile, resumes, applications, contacts, outreach, approvals,
  interviews, and follow-ups.
- Internal endpoints require `x-api-key: SERVICE_API_KEY`.
- Webhooks require `x-webhook-secret: WEBHOOK_SECRET`.
- Worker callbacks require `x-worker-secret: BROWSER_WORKER_SECRET`.
- Secret comparisons use constant-time comparison.
- Webhook events are idempotent by event id.

## CSRF and input handling

- Mutating requests with an `Origin`/`Referer` must match `WEB_URL` or `API_URL`.
- Cookies are `SameSite=Lax`; the dashboard talks to the API through a same-origin rewrite.
- Request bodies are validated with Zod. Unknown fields are stripped.
- Uploads are limited to 10 MB and one file, with MIME/extension checks.
- SQL is parameterized by Prisma.
- Helmet sets security headers; CSP is disabled on the API because it serves only JSON/files.

## Secrets

- Provider and source API keys are encrypted with AES-256-GCM using `SECRETS_KEY`.
- The API never returns decrypted keys; the UI shows a mask.
- HTTP logs redact cookies, authorization, API keys, webhook secrets, and worker secrets.
- `.env` is gitignored. `.env.example` contains placeholders only.
- Generate secrets with `openssl rand -base64 32`.

Rotating `SECRETS_KEY` makes existing encrypted provider/source keys unreadable; re-enter them
after rotation.

## Network

- Only `web`, `api`, `browser-worker`, `n8n`, and `ollama` publish ports, all on `127.0.0.1`.
- PostgreSQL and Redis are reachable only on the internal Compose network.
- For remote access, prefer an SSH tunnel:

  ```bash
  ssh -L 3000:localhost:3000 user@server
  ```

  If you expose the dashboard publicly, put it behind a TLS reverse proxy, set
  `WEB_URL=https://your.domain`, `COOKIE_SECURE=true`, and `TRUST_PROXY=true`. Keep the API and
  worker ports private. Do not expose n8n or Ollama publicly.

## Approval-bound external actions

- `ApprovalRequest` must be `APPROVED`, of the expected type, for the same entity, and unexpired.
- The gate is evaluated when approving, when dispatching a live browser action, and when marking a
  message sent.
- Dry-run actions skip the external call but still record what would have happened.
- Application submissions cannot be bulk approved.
- Daily limits are enforced server-side before dispatch/send.

## Browser worker

- Runs in a separate container with a shared storage mount for generated PDFs and screenshots.
- Uses persistent Chromium profiles in `./browser/profiles`; no passwords in PostgreSQL.
- Refuses file paths outside the shared storage directory.
- Retries callbacks; the database is the source of truth.
- No stealth fingerprinting, CAPTCHA solving, proxy rotation, or anti-bot bypass.
- Screenshots may contain personal data; protect the storage directory and backups.

## Audit and observability

- `AuditLog` records logins, job discovery, scoring, document generation, message generation,
  approvals/rejections, browser actions, submissions, follow-ups, settings, and user changes.
- `AiGeneration` records model, prompt version, input references, output, latency, and failures.
- Logs are structured JSON and redact secrets.
- `/health` and `/ready` expose minimal status.

## Data retention and backups

- PostgreSQL and `./storage` are the state to back up.
- `./browser/profiles` contains live session cookies. Treat it like a password store.
- Backups contain personal data and should be encrypted at rest.
- Deleting a user cascades to their profile and private records, including their job catalog.
- Soft deletion is used for jobs, resumes, applications, and contacts. Jobs also support a separate per-user archive state; both delete and archive are reversible from the Jobs page.

## Known risks

- A local 7B model may produce low-quality text; human review is mandatory.
- Browser automation against third-party sites can break and may violate site terms if misused.
  This project intentionally limits itself to user-approved, human-visible handoffs.
- No email verification or MFA is implemented. Use a strong unique password and keep the service
  on localhost or behind a trusted reverse proxy.
- n8n is a powerful automation service. Protect its UI/owner account and keep it on localhost.
- Redis is not used for auth state in this build; do not assume it adds security isolation.

## Reporting

This is a private self-hosted project. If you fork or deploy it publicly, add a security contact
and a vulnerability disclosure process before accepting users.
