# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @vulcaestus/api...
RUN pnpm --filter @vulcaestus/db generate \
 && pnpm --filter @vulcaestus/types build \
 && pnpm --filter @vulcaestus/ai build \
 && pnpm --filter @vulcaestus/db build \
 && pnpm --filter @vulcaestus/api build

FROM node:22-bookworm-slim AS runner
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app /app
ENV NODE_ENV=production
ENV PROMPTS_DIR=/app/prompts
ENV STORAGE_DIR=/data
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/index.js"]
