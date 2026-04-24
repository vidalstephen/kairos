"""Tests for the model router."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from kairos_cognition.providers.base import (
    Completion,
    Message,
    MessageRole,
    Pricing,
    ProviderInvalidRequest,
    ProviderUnavailable,
)
from kairos_cognition.router.model_router import AllProvidersFailed, ModelRouter, RouteRequest


def _make_completion(content: str = "ok", model: str = "claude-3-5-haiku") -> Completion:
    return Completion(
        content=content,
        model_id=model,
        tokens_in=10,
        tokens_out=5,
        finish_reason="stop",
        cost_usd=0.001,
    )


def _user_msg(text: str) -> Message:
    return Message(role=MessageRole.USER, content=text)


def _make_provider(return_value: Completion | None = None, side_effect=None):
    m = AsyncMock()
    if side_effect is not None:
        m.complete = AsyncMock(side_effect=side_effect)
    else:
        m.complete = AsyncMock(return_value=return_value or _make_completion())
    m.pricing = lambda model_id: Pricing(input_per_1k=0.001, output_per_1k=0.002)
    m.tokenize = lambda text: len(text) // 4
    return m


class TestModelRouter:
    def _router(self, providers=None) -> ModelRouter:
        if providers is None:
            providers = {
                "anthropic": _make_provider(),
                "openai": _make_provider(),
                "openrouter": _make_provider(),
            }
        return ModelRouter(providers)

    @pytest.mark.asyncio
    async def test_success_on_first_provider(self) -> None:
        completion = _make_completion("hello world")
        router = self._router({"anthropic": _make_provider(completion)})
        req = RouteRequest(messages=[_user_msg("hi")], agent_role="ego")
        result = await router.complete(req)
        assert result.content == "hello world"

    @pytest.mark.asyncio
    async def test_explicit_model_skips_chain(self) -> None:
        """When model_id is set, use exactly that model (no chain expansion)."""
        provider = _make_provider(_make_completion("explicit"))
        router = self._router({"anthropic": provider})
        req = RouteRequest(
            messages=[_user_msg("hi")],
            agent_role="ego",
            model_id="claude-3-5-haiku",
        )
        result = await router.complete(req)
        assert result.content == "explicit"
        provider.complete.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_workspace_role_model_override(self) -> None:
        provider = _make_provider(_make_completion("workspace-model"))
        router = self._router({"anthropic": provider})
        req = RouteRequest(
            messages=[_user_msg("hi")],
            agent_role="ego",
            workspace_role_models={"ego": "claude-3-7-sonnet"},
        )
        result = await router.complete(req)
        assert result.content == "workspace-model"

    @pytest.mark.asyncio
    async def test_workspace_default_model_fallback(self) -> None:
        provider = _make_provider(_make_completion("default-model"))
        router = self._router({"openai": provider})
        req = RouteRequest(
            messages=[_user_msg("hi")],
            agent_role="unknown_role_xyz",
            workspace_default_model="gpt-4o-mini",
        )
        result = await router.complete(req)
        assert result.content == "default-model"

    @pytest.mark.asyncio
    async def test_failover_on_unavailable(self) -> None:
        """Primary fails with ProviderUnavailable → should try next provider."""
        primary = _make_provider(side_effect=ProviderUnavailable("timeout"))
        fallback = _make_provider(_make_completion("fallback-response", "gpt-4o-mini"))

        router = self._router(
            {"anthropic": primary, "openai": fallback, "openrouter": _make_provider()}
        )
        req = RouteRequest(messages=[_user_msg("hi")], agent_role="ego")
        result = await router.complete(req)
        assert result.content == "fallback-response"

    @pytest.mark.asyncio
    async def test_all_providers_failed_raises(self) -> None:
        """All providers in the chain unavailable → AllProvidersFailed."""
        fail = _make_provider(side_effect=ProviderUnavailable("down"))
        router = self._router({"anthropic": fail, "openai": fail, "openrouter": fail})
        req = RouteRequest(messages=[_user_msg("hi")], agent_role="ego")
        with pytest.raises(AllProvidersFailed):
            await router.complete(req)

    @pytest.mark.asyncio
    async def test_invalid_request_does_not_failover(self) -> None:
        """ProviderInvalidRequest should propagate immediately without failover."""
        bad = _make_provider(side_effect=ProviderInvalidRequest("bad prompt"))
        good = _make_provider(_make_completion("should not reach"))
        router = self._router({"anthropic": bad, "openai": good, "openrouter": good})
        req = RouteRequest(messages=[_user_msg("bad")], agent_role="ego")
        with pytest.raises(ProviderInvalidRequest):
            await router.complete(req)
        # Ensure the fallback was never called
        good.complete.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_coder_role_uses_correct_chain(self) -> None:
        """Coder role primary is claude-3-7-sonnet (Anthropic)."""
        provider = _make_provider(_make_completion("coder-result"))
        router = self._router({"anthropic": provider})
        req = RouteRequest(messages=[_user_msg("write code")], agent_role="coder")
        result = await router.complete(req)
        assert result.content == "coder-result"
        # Verify called with the coder primary model
        call_args = provider.complete.call_args
        assert call_args[0][1] == "claude-3-7-sonnet"
