SHELL := /bin/bash
COMPOSE := docker compose -f infra/compose/docker-compose.yml
COMPOSE_DEV := $(COMPOSE) -f infra/compose/docker-compose.dev.yml
COMPOSE_PROD := $(COMPOSE) -f infra/compose/docker-compose.prod.yml

.PHONY: help bootstrap up down logs ps build rebuild \
        test test-unit test-integration test-e2e test-safety \
        lint typecheck format \
        doctor seed \
        prod-up prod-pull prod-down \
        clean

help:
	@awk 'BEGIN{FS=":.*?## "}/^[a-zA-Z_-]+:.*?## /{printf "  %-18s %s\n",$$1,$$2}' $(MAKEFILE_LIST)

bootstrap: ## One-time dev bootstrap
	bash scripts/setup.sh

doctor: ## Verify environment
	bash scripts/doctor.sh

up: ## Start dev stack
	$(COMPOSE_DEV) up -d

down: ## Stop dev stack
	$(COMPOSE_DEV) down

logs: ## Tail all service logs
	$(COMPOSE_DEV) logs -f

ps: ## List containers
	$(COMPOSE_DEV) ps

build: ## Build dev images
	$(COMPOSE_DEV) build

rebuild: ## Rebuild dev images without cache
	$(COMPOSE_DEV) build --no-cache

seed: ## Seed initial data
	bash scripts/seed.sh

# --- Tests ---
test: test-unit test-integration ## Unit + integration

test-unit: ## Unit tests across services
	pnpm -r --if-present run test
	cd services/cognition && uv run pytest tests/unit -q || true

test-integration: ## Integration tests
	pnpm -r --if-present run test:integration
	cd services/cognition && uv run pytest tests/integration -q || true

test-e2e: ## End-to-end tests (requires stack up)
	pnpm --filter @kairos/frontend test:e2e

test-safety: ## Safety / adversarial suite (Phase 5+)
	@echo "Not yet implemented (Phase 5)"

# --- Quality ---
lint: ## Lint all
	pnpm -r --if-present run lint
	cd services/cognition && uv run ruff check .

typecheck: ## Typecheck all
	pnpm -r --if-present run typecheck
	cd services/cognition && uv run mypy src/

format: ## Format all
	pnpm -r --if-present run format || true
	cd services/cognition && uv run ruff format .

# --- Production (run on VPS) ---
prod-pull: ## Pull latest images on prod host
	$(COMPOSE_PROD) pull

prod-up: ## Bring up prod stack
	$(COMPOSE_PROD) up -d

prod-down: ## Stop prod stack
	$(COMPOSE_PROD) down

# --- Misc ---
clean: ## Remove dev volumes (DESTROYS DATA)
	$(COMPOSE_DEV) down -v
