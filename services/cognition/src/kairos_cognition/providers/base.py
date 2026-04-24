"""Base types and Protocol for provider adapters."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol, runtime_checkable

if TYPE_CHECKING:
    from collections.abc import AsyncIterator


class MessageRole(StrEnum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"


@dataclass
class Message:
    role: MessageRole
    content: str
    # Optional tool call context (tool role)
    tool_call_id: str | None = None
    name: str | None = None


@dataclass
class TokenDelta:
    text: str
    finish_reason: str | None = None


@dataclass
class Completion:
    content: str
    model_id: str
    tokens_in: int
    tokens_out: int
    finish_reason: str
    cost_usd: float = 0.0


@dataclass
class Pricing:
    """Cost per 1 000 tokens."""

    input_per_1k: float
    output_per_1k: float


class ProviderUnavailable(Exception):
    """503, timeout, rate-limit — eligible for failover."""


class ProviderAuthError(Exception):
    """401/403 — eligible for failover (log as critical)."""


class ProviderInvalidRequest(Exception):
    """4xx that is the caller's fault — do NOT failover."""


@runtime_checkable
class Provider(Protocol):
    """Interface that every provider adapter must satisfy."""

    async def complete(
        self,
        messages: list[Message],
        model: str,
        *,
        max_tokens: int = 1024,
        temperature: float = 1.0,
        tools: list[dict] | None = None,
    ) -> Completion: ...

    async def stream(
        self,
        messages: list[Message],
        model: str,
        *,
        max_tokens: int = 1024,
        temperature: float = 1.0,
    ) -> AsyncIterator[TokenDelta]: ...

    def tokenize(self, text: str) -> int: ...

    def pricing(self, model_id: str) -> Pricing: ...
