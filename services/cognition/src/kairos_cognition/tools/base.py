"""Base types and protocol for Kairos tools.

Every tool implementation must:
- Expose a ``manifest`` property of type :class:`ToolManifest`.
- Implement an async ``execute(params)`` method that returns :class:`ToolResult`.
- Optionally implement ``is_auto_approved(params)`` to signal that a specific
  invocation does not require the approval workflow.

Errors:
- :class:`ToolInvalidParams` — raised when ``execute`` receives params that
  fail schema validation.  The registry validates before dispatch so tools
  themselves only need to raise this for dynamic/semantic checks.
- :class:`ToolExecutionError` — raised for non-recoverable runtime failures.
  Transient failures should be returned as a failed :class:`ToolResult`
  (``success=False``) rather than raising.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ToolParam:
    """Describes a single parameter in a tool manifest."""

    type: str  # "string" | "number" | "boolean"
    description: str = ""
    required: bool = True


@dataclass(frozen=True)
class ToolManifest:
    """Declarative description of a tool — mirrors the control-plane DB schema."""

    name: str
    version: str
    description: str
    params: dict[str, ToolParam]
    capabilities: tuple[str, ...]
    network_policy: str = "none"
    blast_radius: str = "read"
    # Shell patterns (regex strings) that make a call auto-approvable.
    # Only meaningful for shell_exec; registry delegates to the tool.
    auto_approve_patterns: tuple[str, ...] = field(default_factory=tuple)


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------


@dataclass
class ToolResult:
    """Uniform result envelope returned by every tool."""

    tool: str
    success: bool
    output: str
    error: str | None = None
    truncated: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class ToolInvalidParams(Exception):
    """Raised when params fail schema or semantic validation."""

    def __init__(self, tool: str, detail: str) -> None:
        super().__init__(f"[{tool}] invalid params: {detail}")
        self.tool = tool
        self.detail = detail


class ToolExecutionError(Exception):
    """Raised for non-recoverable runtime failures."""

    def __init__(self, tool: str, detail: str) -> None:
        super().__init__(f"[{tool}] execution error: {detail}")
        self.tool = tool
        self.detail = detail


# ---------------------------------------------------------------------------
# Protocol
# ---------------------------------------------------------------------------


@runtime_checkable
class Tool(Protocol):
    """Protocol every tool must satisfy."""

    @property
    def manifest(self) -> ToolManifest: ...

    async def execute(self, params: dict[str, Any]) -> ToolResult: ...

    def is_auto_approved(self, params: dict[str, Any]) -> bool: ...
