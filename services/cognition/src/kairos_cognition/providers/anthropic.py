"""Anthropic provider adapter.

Wraps the `anthropic` SDK with the uniform Provider interface.
Retries once on transient errors (429, 500, connection reset) with
exponential backoff before raising ProviderUnavailable for failover.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from anthropic import (
    APIConnectionError,
    APIStatusError,
    AsyncAnthropic,
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
from kairos_cognition.providers.pricing import compute_cost, get_anthropic_pricing

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

log = logging.getLogger(__name__)

_TRANSIENT = (RateLimitError, APIConnectionError)


def _transient_or_server(exc: BaseException) -> bool:
    if isinstance(exc, APIStatusError):
        return exc.status_code >= 500
    return isinstance(exc, _TRANSIENT)


def _messages_to_anthropic(
    messages: list[Message],
) -> tuple[str | None, list[dict]]:
    """Split off the system prompt; convert the rest."""
    system: str | None = None
    out: list[dict] = []
    for m in messages:
        if m.role == MessageRole.SYSTEM:
            system = m.content
        elif m.role in (MessageRole.USER, MessageRole.ASSISTANT):
            out.append({"role": m.role.value, "content": m.content})
        elif m.role == MessageRole.TOOL:
            out.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": m.tool_call_id or "",
                            "content": m.content,
                        }
                    ],
                }
            )
    return system, out


class AnthropicProvider:
    """Async Anthropic provider."""

    def __init__(self, api_key: str) -> None:
        self._client = AsyncAnthropic(api_key=api_key)

    def pricing(self, model_id: str) -> Pricing:
        return get_anthropic_pricing(model_id)

    def tokenize(self, text: str) -> int:
        # Anthropic does not expose a local tokenizer; approximate with chars/4.
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
        system, anthropic_messages = _messages_to_anthropic(messages)
        kwargs: dict = dict(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=anthropic_messages,
        )
        if system:
            kwargs["system"] = system
        if tools:
            kwargs["tools"] = tools

        try:
            resp = await self._client.messages.create(**kwargs)
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

        content = ""
        for block in resp.content:
            if block.type == "text":
                content += block.text

        tokens_in = resp.usage.input_tokens
        tokens_out = resp.usage.output_tokens
        price = get_anthropic_pricing(model)
        cost = compute_cost(price, tokens_in, tokens_out)

        return Completion(
            content=content,
            model_id=model,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            finish_reason=resp.stop_reason or "stop",
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
        system, anthropic_messages = _messages_to_anthropic(messages)
        kwargs: dict = dict(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=anthropic_messages,
        )
        if system:
            kwargs["system"] = system

        try:
            async with self._client.messages.stream(**kwargs) as stream:
                async for text in stream.text_stream:
                    yield TokenDelta(text=text)
                yield TokenDelta(text="", finish_reason="stop")
        except AuthenticationError as exc:
            raise ProviderAuthError(str(exc)) from exc
        except BadRequestError as exc:
            raise ProviderInvalidRequest(str(exc)) from exc
        except (RateLimitError, APIConnectionError, APIStatusError) as exc:
            raise ProviderUnavailable(str(exc)) from exc
