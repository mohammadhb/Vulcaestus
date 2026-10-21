# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npm install -g pnpm@9.15.0

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @vulcaestus/browser-worker build

ENV NODE_ENV=production
ENV STORAGE_DIR=/data
ENV PROFILES_DIR=/data/profiles
WORKDIR /app/apps/browser-worker
EXPOSE 4100
CMD ["node", "dist/index.js"]
