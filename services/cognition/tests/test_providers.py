"""Tests for provider adapters — uses mocked HTTP responses."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from kairos_cognition.providers.anthropic import AnthropicProvider
from kairos_cognition.providers.base import (
    Message,
    MessageRole,
    ProviderAuthError,
)
from kairos_cognition.providers.openai import OpenAIProvider
from kairos_cognition.providers.openrouter import OpenRouterProvider

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _user_msg(text: str) -> Message:
    return Message(role=MessageRole.USER, content=text)


def _system_msg(text: str) -> Message:
    return Message(role=MessageRole.SYSTEM, content=text)


# ---------------------------------------------------------------------------
# AnthropicProvider
# ---------------------------------------------------------------------------


class TestAnthropicProvider:
    def _provider(self) -> AnthropicProvider:
        return AnthropicProvider(api_key="test-key-anthropic")  # pragma: allowlist secret

    @pytest.mark.asyncio
    async def test_complete_success(self) -> None:
        provider = self._provider()

        mock_block = MagicMock()
        mock_block.type = "text"
        mock_block.text = "Hello from Anthropic"

        mock_usage = MagicMock()
        mock_usage.input_tokens = 10
        mock_usage.output_tokens = 5

        mock_resp = MagicMock()
        mock_resp.content = [mock_block]
        mock_resp.usage = mock_usage
        mock_resp.stop_reason = "end_turn"

        with patch.object(
            provider._client.messages, "create", new=AsyncMock(return_value=mock_resp)
        ):
            result = await provider.complete(
                [_system_msg("You are helpful"), _user_msg("Say hi")],
                "claude-3-5-haiku",
            )

        assert result.content == "Hello from Anthropic"
        assert result.tokens_in == 10
        assert result.tokens_out == 5
        assert result.cost_usd > 0

    @pytest.mark.asyncio
    async def test_complete_auth_error(self) -> None:
        from anthropic import AuthenticationError

        provider = self._provider()
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.headers = {}

        with (
            patch.object(
                provider._client.messages,
                "create",
                new=AsyncMock(
                    side_effect=AuthenticationError("bad key", response=mock_response, body={})
                ),
            ),
            pytest.raises(ProviderAuthError),
        ):
            await provider.complete([_user_msg("hi")], "claude-3-5-haiku")

    def test_tokenize_approximation(self) -> None:
        provider = self._provider()
        count = provider.tokenize("hello world")
        assert count >= 1

    def test_pricing_returns_pricing(self) -> None:
        provider = self._provider()
        p = provider.pricing("claude-3-5-haiku")
        assert p.input_per_1k > 0


# ---------------------------------------------------------------------------
# OpenAIProvider
# ---------------------------------------------------------------------------


class TestOpenAIProvider:
    def _provider(self) -> OpenAIProvider:
        return OpenAIProvider(api_key="test-key-openai")  # pragma: allowlist secret

    @pytest.mark.asyncio
    async def test_complete_success(self) -> None:
        provider = self._provider()

        mock_message = MagicMock()
        mock_message.content = "Hello from OpenAI"

        mock_choice = MagicMock()
        mock_choice.message = mock_message
        mock_choice.finish_reason = "stop"

        mock_usage = MagicMock()
        mock_usage.prompt_tokens = 8
        mock_usage.completion_tokens = 4

        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        mock_resp.usage = mock_usage

        with patch.object(
            provider._client.chat.completions,
            "create",
            new=AsyncMock(return_value=mock_resp),
        ):
            result = await provider.complete([_user_msg("Say hello")], "gpt-4o-mini")

        assert result.content == "Hello from OpenAI"
        assert result.tokens_in == 8
        assert result.tokens_out == 4

    def test_tokenize_approximation(self) -> None:
        provider = self._provider()
        assert provider.tokenize("short text") >= 1


# ---------------------------------------------------------------------------
# OpenRouterProvider
# ---------------------------------------------------------------------------


class TestOpenRouterProvider:
    def test_strip_prefix(self) -> None:
        provider = OpenRouterProvider(api_key="test-key-or")
        # pricing should work with stripped path
        p = provider.pricing("openrouter/anthropic/claude-3-5-haiku")
        assert p.input_per_1k > 0

    def test_tokenize_delegates(self) -> None:
        provider = OpenRouterProvider(api_key="test-key-or")
        assert provider.tokenize("hello") >= 1
