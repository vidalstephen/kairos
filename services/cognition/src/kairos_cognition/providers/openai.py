"""OpenAI provider adapter.

Wraps the `openai` SDK with the uniform Provider interface.
Retries once on transient errors before raising ProviderUnavailable.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from openai import (
    APIConnectionError,
    APIStatusError,
    AsyncOpenAI,
    AuthenticationError,
    BadRequestError,
    RateLimitError,
)
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from kairos_cognition.providers.base import (
    Completion,
    Message,
    MessageRole,
    Pricing,
    ProviderAuthError,
    ProviderInvalidRequest,
    ProviderUnavailable,
    TokenDelta,
)
from kairos_cognition.providers.pricing import compute_cost, get_openai_pricing

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

log = logging.getLogger(__name__)


def _messages_to_openai(messages: list[Message]) -> list[dict]:
    out: list[dict] = []
    for m in messages:
        if m.role == MessageRole.TOOL:
            out.append(
                {
                    "role": "tool",
                    "tool_call_id": m.tool_call_id or "",
                    "content": m.content,
                }
            )
        else:
            out.append({"role": m.role.value, "content": m.content})
    return out


class OpenAIProvider:
    """Async OpenAI provider."""

    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    def pricing(self, model_id: str) -> Pricing:
        return get_openai_pricing(model_id)

    def tokenize(self, text: str) -> int:
        # Approximate: GPT tokeniser averages ~4 chars/token.
        return max(1, len(text) // 4)

    async def complete(
        self,
        messages: list[Message],
        model: str,
        *,
        max_tokens: int = 1024,
        temperature: float = 1.0,
        tools: list[dict] | None = None,
    ) -> Completion:
        return await self._complete_with_retry(
            messages, model, max_tokens=max_tokens, temperature=temperature, tools=tools
        )

    @retry(
        retry=retry_if_exception_type((RateLimitError, APIConnectionError)),
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=3),
        reraise=True,
    )
    async def _complete_with_retry(
        self,
        messages: list[Message],
        model: str,
        *,
        max_tokens: int,
        temperature: float,
        tools: list[dict] | None,
    ) -> Completion:
        openai_messages = _messages_to_openai(messages)
        kwargs: dict = dict(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=openai_messages,
        )
        if tools:
            kwargs["tools"] = tools

        try:
            resp = await self._client.chat.completions.create(**kwargs)
        except AuthenticationError as exc:
            raise ProviderAuthError(str(exc)) from exc
        except BadRequestError as exc:
            raise ProviderInvalidRequest(str(exc)) from exc
        except (RateLimitError, APIConnectionError) as exc:
            raise ProviderUnavailable(str(exc)) from exc
        except APIStatusError as exc:
            if exc.status_code >= 500:
                raise ProviderUnavailable(str(exc)) from exc
            raise ProviderInvalidRequest(str(exc)) from exc

        choice = resp.choices[0]
        content = choice.message.content or ""
        tokens_in = resp.usage.prompt_tokens if resp.usage else 0
        tokens_out = resp.usage.completion_tokens if resp.usage else 0
        price = get_openai_pricing(model)
        cost = compute_cost(price, tokens_in, tokens_out)

        return Completion(
            content=content,
            model_id=model,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            finish_reason=choice.finish_reason or "stop",
            cost_usd=cost,
        )

    async def stream(
        self,
        messages: list[Message],
        model: str,
        *,
        max_tokens: int = 1024,
        temperature: float = 1.0,
    ) -> AsyncIterator[TokenDelta]:
        openai_messages = _messages_to_openai(messages)
        try:
            async with self._client.chat.completions.stream(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=openai_messages,  # type: ignore[arg-type]
            ) as stream:
                async for chunk in stream:
                    delta = chunk.choices[0].delta if chunk.choices else None
                    if delta and delta.content:
                        yield TokenDelta(text=delta.content)
                yield TokenDelta(text="", finish_reason="stop")
        except AuthenticationError as exc:
            raise ProviderAuthError(str(exc)) from exc
        except BadRequestError as exc:
            raise ProviderInvalidRequest(str(exc)) from exc
        except (RateLimitError, APIConnectionError, APIStatusError) as exc:
            raise ProviderUnavailable(str(exc)) from exc
