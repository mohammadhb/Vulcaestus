# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS builder

ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_OPTIONS=--max-old-space-size=3072
RUN corepack enable

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @vulcaestus/web...
RUN pnpm --filter @vulcaestus/types build \
 && pnpm --filter @vulcaestus/web build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
COPY --from=builder /app /app
ENV NODE_ENV=production
ENV API_INTERNAL_URL=http://api:4000
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]
