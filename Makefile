SHELL := /bin/bash
.DEFAULT_GOAL := help

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-22s\033[0m %s\n", $$1, $$2}'

env: ## Create .env from .env.example if missing
	@test -f .env || (cp .env.example .env && echo "Created .env — replace change-me secrets before starting.")

up: env ## Build and start the full stack (sequential build avoids Docker VM OOM)
	docker compose build api
	docker compose build browser-worker
	docker compose build web
	docker compose up -d

start: env ## Start without rebuilding
	docker compose up -d

down: ## Stop the stack (keeps volumes)
	docker compose down

destroy: ## Stop and DELETE all volumes (irreversible)
	docker compose down -v

logs: ## Tail all logs
	docker compose logs -f --tail=100

logs-api: ## Tail API logs
	docker compose logs -f --tail=100 api

logs-worker: ## Tail browser worker logs
	docker compose logs -f --tail=100 browser-worker

ps: ## Show service status
	docker compose ps

migrate: ## Apply pending database migrations
	docker compose run --rm migrate

seed: ## Seed sources (and optional admin from ADMIN_* env)
	docker compose exec api node /app/packages/database/node_modules/tsx/dist/cli.mjs /app/packages/database/prisma/seed.ts

model: ## Pull the configured Ollama model
	docker compose exec ollama ollama pull $${OLLAMA_MODEL:-qwen2.5:7b-instruct}

workflows-install: ## Import all n8n workflow JSON files
	docker compose exec n8n n8n import:workflow --separate --input=/workflows

workflows-validate: ## Validate workflow JSON locally
	node scripts/validate-workflows.mjs

test: ## Run unit tests
	pnpm test

typecheck: ## Typecheck all packages
	pnpm typecheck

build: ## Build all packages locally
	pnpm build

dev: ## Run API, worker, and web in development (requires local Postgres/Ollama)
	pnpm dev

backup: ## Dump Postgres to backups/vulcaestus.sql
	@mkdir -p backups
	docker compose exec -T postgres pg_dump -U $${POSTGRES_USER:-vulcaestus} $${POSTGRES_DB:-vulcaestus} > backups/vulcaestus-$$(date +%Y%m%d-%H%M%S).sql

restore: ## Restore a dump: make restore FILE=backups/file.sql
	@test -n "$(FILE)" || (echo "Usage: make restore FILE=backups/....sql" && exit 1)
	docker compose exec -T postgres psql -U $${POSTGRES_USER:-vulcaestus} $${POSTGRES_DB:-vulcaestus} < $(FILE)

psql: ## Open a psql shell
	docker compose exec postgres psql -U $${POSTGRES_USER:-vulcaestus} $${POSTGRES_DB:-vulcaestus}

.PHONY: help env up start down destroy logs logs-api logs-worker ps migrate seed model workflows-install workflows-validate test typecheck build dev backup restore psql
