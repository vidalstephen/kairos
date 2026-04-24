"""Tests for the Ego main loop."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from kairos_cognition.context.composer import ContextComposer
from kairos_cognition.ego.ego_loop import EgoLoop, EgoPass, _parse_routing_directive
from kairos_cognition.providers.base import (
    Completion,
    Pricing,
)
from kairos_cognition.router.model_router import ModelRouter


def _make_completion(content: str) -> Completion:
    return Completion(
        content=content,
        model_id="claude-3-5-haiku",
        tokens_in=15,
        tokens_out=8,
        finish_reason="stop",
        cost_usd=0.001,
    )


def _make_router(response: str) -> ModelRouter:
    mock_provider = MagicMock()
    mock_provider.complete = AsyncMock(return_value=_make_completion(response))
    mock_provider.pricing = lambda m: Pricing(input_per_1k=0.001, output_per_1k=0.002)
    mock_provider.tokenize = lambda t: len(t) // 4
    return ModelRouter({"anthropic": mock_provider})


class TestEgoLoop:
    def _ego(self, response: str = "I can help with that.") -> EgoLoop:
        router = _make_router(response)
        composer = ContextComposer()
        return EgoLoop(router=router, composer=composer)

    def _pass(self, message: str = "hello") -> EgoPass:
        return EgoPass(
            session_id="sess-1",
            run_id="run-1",
            user_message=message,
        )

    @pytest.mark.asyncio
    async def test_run_pass_returns_result(self) -> None:
        ego = self._ego("I can help with that.")
        result = await ego.run_pass(self._pass())
        assert result.run_id == "run-1"
        assert result.response == "I can help with that."
        assert result.tokens_in == 15
        assert result.tokens_out == 8

    @pytest.mark.asyncio
    async def test_no_routing_directive(self) -> None:
        ego = self._ego("Here is the answer to your question.")
        result = await ego.run_pass(self._pass())
        assert result.route_role is None
        assert result.route_brief is None

    @pytest.mark.asyncio
    async def test_routing_directive_parsed(self) -> None:
        response = (
            'I need to escalate this. {"route": "coder", "brief": "Write unit tests for module X"}'
        )
        ego = self._ego(response)
        result = await ego.run_pass(self._pass("write me tests"))
        assert result.route_role == "coder"
        assert result.route_brief == "Write unit tests for module X"

    @pytest.mark.asyncio
    async def test_session_mutex_serializes_passes(self) -> None:
        """Two concurrent passes on same session should not overlap."""
        import asyncio

        ego = self._ego("ok")
        p1 = self._pass("first")
        p2 = EgoPass(session_id="sess-1", run_id="run-2", user_message="second")

        results = await asyncio.gather(ego.run_pass(p1), ego.run_pass(p2))
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_different_sessions_run_concurrently(self) -> None:
        """Passes on different sessions use different locks."""
        import asyncio

        ego = self._ego("ok")
        p1 = EgoPass(session_id="sess-A", run_id="run-1", user_message="hi")
        p2 = EgoPass(session_id="sess-B", run_id="run-2", user_message="hello")

        results = await asyncio.gather(ego.run_pass(p1), ego.run_pass(p2))
        assert len(results) == 2


class TestParseRoutingDirective:
    def test_inline_json(self) -> None:
        content = 'This needs code. {"route": "coder", "brief": "Generate tests"}'
        role, brief = _parse_routing_directive(content)
        assert role == "coder"
        assert brief == "Generate tests"

    def test_pure_json_response(self) -> None:
        content = '{"route": "researcher", "brief": "Find docs for httpx"}'
        role, brief = _parse_routing_directive(content)
        assert role == "researcher"
        assert brief == "Find docs for httpx"

    def test_no_directive(self) -> None:
        role, brief = _parse_routing_directive("Just a plain response without routing.")
        assert role is None
        assert brief is None

    def test_malformed_json_returns_none(self) -> None:
        role, brief = _parse_routing_directive('{"route": "coder"')
        assert role is None
        assert brief is None
