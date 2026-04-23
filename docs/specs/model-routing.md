# Model Routing

See also: [ADR-0009](../adr/0009-model-providers.md), spec §5.

---

## Stratum → Model Map

Defaults; configurable per-workspace via `workspace.settings.role_models`.

| Stratum | Role | Primary | Fallback 1 | Fallback 2 |
|---|---|---|---|---|
| 1 | Ego | `claude-3-5-haiku` (Anthropic) | `gpt-4o-mini` (OpenAI) | `openrouter/anthropic/claude-3-5-haiku` |
| 2 | Reasoning | `claude-3-7-sonnet` (Anthropic) | `gpt-4o` (OpenAI) | `openrouter/anthropic/claude-3-7-sonnet` |
| 2 | Deep Reasoning | `claude-3-opus` (Anthropic) | — | `openrouter/openai/gpt-4-turbo` |
| 3 | Coder | `claude-3-7-sonnet` | `gpt-4o` | `openrouter/deepseek/deepseek-coder` |
| 3 | Researcher | `claude-3-7-sonnet` | `gpt-4o` | — |
| 3 | Doc Processor | `claude-3-5-haiku` | `gpt-4o-mini` | — |
| 3 | Browser Operator | `claude-3-7-sonnet` | `gpt-4o` | — |
| 3 | Safety Checker | `claude-3-5-haiku` | `gpt-4o-mini` | — |
| 4 | Utility | `claude-3-5-haiku` | `gpt-4o-mini` | `openrouter/meta-llama/llama-3-8b` |
| — | Embeddings | `text-embedding-3-small` (OpenAI) | `openrouter/openai/text-embedding-3-small` | — |

## Resolution Chain

```
def resolve_model(request) -> ModelId:
    # 1. Explicit request
    if request.model:
        return request.model
    # 2. Workspace role_models
    if workspace.settings.role_models and request.agent_role in workspace.settings.role_models:
        return workspace.settings.role_models[request.agent_role]
    # 3. Workspace default
    if workspace.settings.default_model:
        return workspace.settings.default_model
    # 4. Global default for this stratum+role
    return STRATUM_DEFAULTS[request.stratum][request.role]
```

## Failover Behavior

Per call, the router tries providers in order:

```python
providers = failover_chain_for(model_id)  # [primary, fallback1, fallback2]
for provider in providers:
    try:
        return await provider.complete(messages, tools=tools, ...)
    except ProviderUnavailable:   # 503, timeout, rate limit
        continue
    except ProviderAuthError:     # 401, 403
        log_critical("provider auth failed"); continue
    except ProviderInvalidRequest:
        raise  # don't fallback — the request is broken
raise AllProvidersFailed(model_id)
```

Retry within a single provider: one retry on transient errors (429, 500, connection reset) with exponential backoff up to 3s. Then fall over.

## Provider Adapters

Each provider implements:

```python
class Provider(Protocol):
    async def complete(messages, tools?, stream?, ...) -> Completion
    async def stream(messages, tools?, ...) -> AsyncIterator[TokenDelta]
    def tokenize(text) -> int
    def pricing(model_id) -> Pricing  # input_per_1k, output_per_1k
```

Uniform internal Message type; provider adapter translates to/from each vendor's schema. Tool-calling shape normalized to a common representation.

## Streaming

- Token streaming: all three providers support server-sent events
- Cognition aggregates tokens and re-emits via Redis pub/sub (`run:{id}:tokens`)
- RunStreamService in control plane forwards to WS (`run.token`)
- Tool calls are non-streaming — cognition uses `complete()` when tools are in play (matches prior-build pattern)

## Cost Tracking

Every call records:
- `model_id`, `provider`, `tokens_in`, `tokens_out`, `started_at`, `ended_at`
- `cost_usd` computed at call time from static pricing table
- Row in `task_dispatch_spans` + attribution in `runs.cost_usd`

Pricing table: `services/cognition/src/kairos_cognition/providers/pricing.py`. Updated quarterly.

## Budget Enforcement

Two ceilings per run:
- **Token ceiling** (`run.budget_tokens`) — hard stop; if reached, run transitions to `TIMED_OUT` with `reason="token_budget_exceeded"`
- **Time ceiling** (`run.budget_time_ms`) — wall clock; same handling

Delegation budget: child runs inherit a split of parent budget; parent tracks aggregate via `propagateChildResult()`.

## Per-Workspace Cost Cap

`workspace.settings.monthly_cost_cap_usd`. Computed from `spans` aggregation. Soft-warn at 80%; hard-block new runs at 100% (returns `CONFLICT` with code `WORKSPACE_BUDGET_EXCEEDED`).

## Role-Aware Tool Allowlist

Per spec §16 and prior-build `ROLE_ALLOWED_TIERS`:

| Role | Allowed tool tiers |
|---|---|
| executor | T0, T1 |
| planner | T0 |
| researcher | T0, T1 |
| coder | T0, T1, T2 |
| reviewer | T0 |
| browser_operator | T0, T1, T2 |
| safety_checker | T0 |

Tier shorthand (`T0..T3`) mirrors blast radius bands. The router attaches the allowed-tier set to the dispatch envelope; the policy engine enforces it at tool call time.

## Configuration Surface

Layer 1 params (requires gate approval to change):

```
model.ego.primary                 = "claude-3-5-haiku"
model.ego.fallback_chain          = ["gpt-4o-mini", "openrouter/anthropic/claude-3-5-haiku"]
model.reasoning.primary           = "claude-3-7-sonnet"
model.specialist.coder.primary    = "claude-3-7-sonnet"
model.utility.primary             = "claude-3-5-haiku"
model.embedding.primary           = "text-embedding-3-small"
cost.monthly_cap_usd_default      = 200
cost.soft_warn_fraction           = 0.8
```

Workspace-level overrides (not gate-protected — workspace owners can adjust):

```
workspace.settings.default_model
workspace.settings.role_models
workspace.settings.monthly_cost_cap_usd
workspace.settings.run_budget_tokens
workspace.settings.run_budget_time_ms
```
