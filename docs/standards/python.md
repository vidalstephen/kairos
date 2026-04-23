# Python Standards

Applies to `services/cognition/`.

---

## Language

- Python 3.12 (pinned in `.python-version`)
- Type hints everywhere (enforced by mypy strict)
- `from __future__ import annotations` in every module

## Package Management

- `uv` for all Python tooling
- `pyproject.toml` per service
- Dependencies pinned with lockfile (`uv.lock`)

## Type Checking

mypy in strict mode:

```toml
[tool.mypy]
python_version = "3.12"
strict = true
warn_return_any = true
warn_unused_ignores = true
disallow_untyped_defs = true
disallow_any_unimported = true
no_implicit_optional = true
```

`# type: ignore` requires a comment explaining why.

## Runtime Validation

pydantic v2 for all external inputs (HTTP bodies, WS events, config, env, model responses):

```python
class DispatchRequest(BaseModel):
    task_brief: str
    agent_role: Literal["executor", "planner", "researcher", "coder", "reviewer", "browser_operator", "safety_checker"]
    run_id: UUID
    budget_tokens: int = Field(ge=100, le=200_000)
    budget_time_ms: int = Field(ge=1000, le=600_000)
```

## Async

- `asyncio` throughout
- `anyio` for cross-runtime primitives if needed
- Never mix sync I/O in async handlers
- `httpx.AsyncClient` for HTTP
- `asyncpg` for Postgres; `redis.asyncio` for Redis

## Project Layout

```
services/cognition/
  pyproject.toml
  src/kairos_cognition/
    __init__.py
    main.py                 # service entrypoint
    config.py               # pydantic Settings
    ego/                    # Ego loop
    dispatch/               # task dispatcher
    providers/              # anthropic, openai, openrouter
    memory/                 # memory client (calls control plane)
    safety/                 # sanitizer, injection filter
    utility/                # utility workers
    rpc/                    # internal RPC clients (control plane)
    telemetry/              # span emission
  tests/
    unit/
    integration/
```

Namespace package: `kairos_cognition`.

## Naming

- Modules + files: `snake_case.py`
- Classes: `PascalCase`
- Functions, methods, variables: `snake_case`
- Constants: `SCREAMING_SNAKE_CASE`
- Private: `_leading_underscore`

## Errors

- Domain-specific exception hierarchy rooted at `KairosError`
- Exceptions carry `code: str` + typed context
- Don't catch bare `Exception`; catch narrowly and re-raise with context

```python
class KairosError(Exception):
    code: str = "internal_error"

class ProviderUnavailable(KairosError):
    code = "provider_unavailable"
```

## Logging

- `structlog` with JSON renderer in prod, console in dev
- Bound context: `trace_id`, `session_id`, `run_id`, `stratum`, `model_id`
- No `print()` in library or service code

```python
log = structlog.get_logger().bind(service="cognition")
log.info("dispatch.started", run_id=run_id, stratum=2)
```

## Linting + Formatting

- `ruff` for linting and formatting (single tool)
- `ruff format` (Black-compatible)
- Rules: E, F, I, UP, B, SIM, TCH, RUF + select extras

## Testing

- `pytest` + `pytest-asyncio`
- Fixtures in `conftest.py`; avoid magic import-based fixtures
- Coverage target: 80% overall; 100% on safety-critical (sanitizer, injection filter)
- Integration tests use real Postgres + Redis via docker-compose

## Dependencies (core)

```toml
[project]
dependencies = [
  "pydantic>=2.6",
  "pydantic-settings>=2.2",
  "httpx>=0.27",
  "structlog>=24.1",
  "asyncpg>=0.29",
  "redis>=5.0",
  "anthropic>=0.25",
  "openai>=1.20",
  "opentelemetry-api>=1.24",
  "opentelemetry-sdk>=1.24",
  "opentelemetry-exporter-otlp-proto-http>=1.24",
  "tenacity>=8.2",
]

[dependency-groups]
dev = [
  "pytest>=8.1",
  "pytest-asyncio>=0.23",
  "pytest-cov>=4.1",
  "mypy>=1.9",
  "ruff>=0.3",
]
```

## Secrets

- Never log values
- Only resolve via alias through the control-plane RPC; cognition does not talk to vault directly
- `pydantic_settings.SecretStr` for any in-memory secret; `.get_secret_value()` only at the call site

## Concurrency

- TaskGroup for structured concurrency where supported
- Cancellation: respect `asyncio.CancelledError`; clean up and re-raise
- Timeouts: wrap every external call in `asyncio.timeout()` with budget-derived deadlines
