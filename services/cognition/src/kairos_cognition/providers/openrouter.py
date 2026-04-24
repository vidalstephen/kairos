"""OpenRouter provider adapter.

OpenRouter exposes an OpenAI-compatible API.  We reuse OpenAIProvider with
the OpenRouter base URL and handle the `openrouter/<org>/<model>` naming
convention internally.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from kairos_cognition.providers.base import (
    Completion,
    Message,
    Pricing,
    TokenDelta,
)
from kairos_cognition.providers.openai import OpenAIProvider
from kairos_cognition.providers.pricing import get_openrouter_pricing

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def _strip_prefix(model_id: str) -> str:
    """Remove `openrouter/` prefix if present."""
    if model_id.startswith("openrouter/"):
        return model_id[len("openrouter/") :]
    return model_id


class OpenRouterProvider:
    """Async OpenRouter provider (OpenAI-compatible)."""

    def __init__(self, api_key: str) -> None:
        self._delegate = OpenAIProvider(api_key=api_key, base_url=_OPENROUTER_BASE_URL)

    def pricing(self, model_id: str) -> Pricing:
        return get_openrouter_pricing(_strip_prefix(model_id))

    def tokenize(self, text: str) -> int:
        return self._delegate.tokenize(text)

    async def complete(
        self,
        messages: list[Message],
        model: str,
        *,
        max_tokens: int = 1024,
        temperature: float = 1.0,
        tools: list[dict] | None = None,
    ) -> Completion:
        bare = _strip_prefix(model)
        completion = await self._delegate.complete(
            messages,
            bare,
            max_tokens=max_tokens,
            temperature=temperature,
            tools=tools,
        )
        # Restore the original model_id in the completion so callers see it.
        return Completion(
            content=completion.content,
            model_id=model,
            tokens_in=completion.tokens_in,
            tokens_out=completion.tokens_out,
            finish_reason=completion.finish_reason,
            cost_usd=completion.cost_usd,
        )

    async def stream(
        self,
        messages: list[Message],
        model: str,
        *,
        max_tokens: int = 1024,
        temperature: float = 1.0,
    ) -> AsyncIterator[TokenDelta]:
        bare = _strip_prefix(model)
        async for delta in self._delegate.stream(
            messages, bare, max_tokens=max_tokens, temperature=temperature
        ):
            yield delta
