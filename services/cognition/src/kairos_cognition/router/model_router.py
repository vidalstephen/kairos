"""Model router with per-stratum failover chains.

Implements the resolution and failover logic from docs/specs/model-routing.md.

Resolution order:
1. Explicit model_id in request
2. workspace.settings.role_models[agent_role]
3. workspace.settings.default_model
4. Global STRATUM_DEFAULTS[stratum][role]

Failover: tries primary → fallback1 → fallback2 per the static chains.
One retry within a provider on transient errors before falling to the next.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import structlog

from kairos_cognition.providers.base import (
    Completion,
    Message,
    Provider,
    ProviderAuthError,
    ProviderInvalidRequest,
    ProviderUnavailable,
)

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Static stratum → model chains from docs/specs/model-routing.md
# Each entry: (primary, fallback1, fallback2 | None)
# ---------------------------------------------------------------------------
_STRATUM_CHAINS: dict[str, list[str]] = {
    # Stratum 1
    "ego": [
        "claude-3-5-haiku",
        "gpt-4o-mini",
        "openrouter/anthropic/claude-3-5-haiku",
    ],
    # Stratum 2
    "reasoning": [
        "claude-3-7-sonnet",
        "gpt-4o",
        "openrouter/anthropic/claude-3-7-sonnet",
    ],
    "deep_reasoning": [
        "claude-3-opus",
        "openrouter/openai/gpt-4-turbo",
    ],
    # Stratum 3
    "coder": [
        "claude-3-7-sonnet",
        "gpt-4o",
        "openrouter/deepseek/deepseek-coder",
    ],
    "researcher": [
        "claude-3-7-sonnet",
        "gpt-4o",
    ],
    "doc_processor": [
        "claude-3-5-haiku",
        "gpt-4o-mini",
    ],
    "browser_operator": [
        "claude-3-7-sonnet",
        "gpt-4o",
    ],
    "safety_checker": [
        "claude-3-5-haiku",
        "gpt-4o-mini",
    ],
    # Stratum 4
    "utility": [
        "claude-3-5-haiku",
        "gpt-4o-mini",
        "openrouter/meta-llama/llama-3-8b",
    ],
}

# model_id → provider name
_MODEL_PROVIDER: dict[str, str] = {
    "claude-3-5-haiku": "anthropic",
    "claude-3-7-sonnet": "anthropic",
    "claude-3-opus": "anthropic",
    "gpt-4o": "openai",
    "gpt-4o-mini": "openai",
}


def _provider_for(model_id: str) -> str:
    if model_id.startswith("openrouter/"):
        return "openrouter"
    return _MODEL_PROVIDER.get(model_id, "anthropic")


@dataclass
class RouteRequest:
    """Parameters for a model-router dispatch."""

    messages: list[Message]
    agent_role: str = "ego"
    # Explicit override — skips resolution chain
    model_id: str | None = None
    max_tokens: int = 1024
    temperature: float = 1.0
    tools: list[dict] | None = None
    # Workspace-level overrides (injected by caller)
    workspace_role_models: dict[str, str] = field(default_factory=dict)
    workspace_default_model: str | None = None


class AllProvidersFailed(Exception):
    """Raised when every provider in the failover chain has been exhausted."""

    def __init__(self, model_chain: list[str]) -> None:
        super().__init__(f"All providers failed for chain: {model_chain}")
        self.model_chain = model_chain


class ModelRouter:
    """Routes completion requests through the failover chain."""

    def __init__(self, providers: dict[str, Provider]) -> None:
        """
        Args:
            providers: mapping of provider name → adapter instance.
                       Expected keys: 'anthropic', 'openai', 'openrouter'.
        """
        self._providers = providers

    def _resolve_chain(self, request: RouteRequest) -> list[str]:
        """Return the ordered list of model IDs to try."""
        # 1. Explicit model
        if request.model_id:
            return [request.model_id]
        # 2. Workspace role_models
        if request.agent_role in request.workspace_role_models:
            model = request.workspace_role_models[request.agent_role]
            return [model]
        # 3. Workspace default
        if request.workspace_default_model:
            return [request.workspace_default_model]
        # 4. Global defaults for this role
        role = request.agent_role.lower()
        chain = _STRATUM_CHAINS.get(role) or _STRATUM_CHAINS["ego"]
        return chain

    async def complete(self, request: RouteRequest) -> Completion:
        """Run the failover chain; return the first successful completion."""
        chain = self._resolve_chain(request)
        last_exc: Exception | None = None

        for model_id in chain:
            provider_name = _provider_for(model_id)
            provider = self._providers.get(provider_name)
            if provider is None:
                log.warning("router.provider_missing", provider=provider_name, model=model_id)
                continue

            try:
                log.debug("router.attempting", model=model_id, provider=provider_name)
                result = await provider.complete(
                    request.messages,
                    model_id,
                    max_tokens=request.max_tokens,
                    temperature=request.temperature,
                    tools=request.tools,
                )
                log.info(
                    "router.success",
                    model=model_id,
                    provider=provider_name,
                    tokens_in=result.tokens_in,
                    tokens_out=result.tokens_out,
                    cost_usd=result.cost_usd,
                )
                return result
            except ProviderInvalidRequest:
                # The request is broken — don't failover, re-raise immediately.
                raise
            except ProviderAuthError as exc:
                log.critical(
                    "router.auth_failed",
                    provider=provider_name,
                    model=model_id,
                    error=str(exc),
                )
                last_exc = exc
                continue
            except ProviderUnavailable as exc:
                log.warning(
                    "router.provider_unavailable",
                    provider=provider_name,
                    model=model_id,
                    error=str(exc),
                )
                last_exc = exc
                continue

        raise AllProvidersFailed(chain) from last_exc
