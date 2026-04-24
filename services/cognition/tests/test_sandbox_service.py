"""Tests for sandbox/service.py — SandboxService."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from kairos_cognition.sandbox.capability_token import clear_used_tokens
from kairos_cognition.sandbox.egress_policy import NetworkPolicy
from kairos_cognition.sandbox.service import (
    EXIT_KILLED_BY_TIMEOUT,
    SandboxConfig,
    SandboxService,
)
from kairos_cognition.tools.base import ToolManifest, ToolParam, ToolResult
from kairos_cognition.tools.registry import ToolRegistry


@pytest.fixture(autouse=True)
def _clear_tokens() -> None:
    clear_used_tokens()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_tool(name: str = "dummy", *, success: bool = True, exit_code: int = 0) -> MagicMock:
    tool = MagicMock()
    tool.manifest = ToolManifest(
        name=name,
        version="1.0.0",
        description="test tool",
        params={"x": ToolParam(type="string", description="", required=True)},
        capabilities=(),
        network_policy="none",
        blast_radius="read",
    )
    tool.is_auto_approved.return_value = True
    tool.execute = AsyncMock(
        return_value=ToolResult(
            tool=name,
            success=success,
            output="ok",
            metadata={"exit_code": exit_code},
        )
    )
    return tool


def _make_registry(*tools: MagicMock) -> ToolRegistry:
    reg = ToolRegistry()
    for t in tools:
        reg.register(t)
    return reg


# ---------------------------------------------------------------------------
# Basic execution
# ---------------------------------------------------------------------------


async def test_execute_success_returns_result() -> None:
    tool = _make_tool("dummy")
    reg = _make_registry(tool)
    svc = SandboxService(reg)

    result = await svc.execute("dummy", {"x": "hello"})

    assert result.tool_result.success is True
    assert result.tool_result.output == "ok"


async def test_execute_mints_capability_token() -> None:
    tool = _make_tool("dummy")
    reg = _make_registry(tool)
    svc = SandboxService(reg)

    result = await svc.execute("dummy", {"x": "v"})

    token = result.capability_token
    assert isinstance(token, str)
    assert "." in token
    assert len(token) > 20


async def test_each_call_gets_unique_token() -> None:
    tool = _make_tool("dummy")
    reg = _make_registry(tool)
    svc = SandboxService(reg)

    r1 = await svc.execute("dummy", {"x": "v"})
    r2 = await svc.execute("dummy", {"x": "v"})

    assert r1.capability_token != r2.capability_token


# ---------------------------------------------------------------------------
# Unknown tool
# ---------------------------------------------------------------------------


async def test_unknown_tool_returns_error_result() -> None:
    reg = ToolRegistry()
    svc = SandboxService(reg)

    result = await svc.execute("nonexistent", {})

    assert result.tool_result.success is False
    assert "not found" in (result.tool_result.error or "")


async def test_unknown_tool_exit_code_is_none() -> None:
    svc = SandboxService(ToolRegistry())
    result = await svc.execute("ghost", {})
    assert result.exit_code is None
    assert result.killed_by_timeout is False


# ---------------------------------------------------------------------------
# Timeout
# ---------------------------------------------------------------------------


async def test_timeout_sets_killed_by_timeout() -> None:
    tool = MagicMock()
    tool.manifest = _make_tool("slow").manifest

    async def _hang(_params: dict) -> ToolResult:
        await asyncio.sleep(60)
        return ToolResult(tool="slow", success=True, output="")  # pragma: no cover

    tool.execute = _hang
    tool.is_auto_approved.return_value = True

    reg = _make_registry(tool)
    config = SandboxConfig(timeout_s=0.05)
    svc = SandboxService(reg, config)

    result = await svc.execute("slow", {"x": "v"})

    assert result.killed_by_timeout is True
    assert result.exit_code == EXIT_KILLED_BY_TIMEOUT
    assert result.tool_result.success is False


async def test_timeout_error_message_mentions_seconds() -> None:
    tool = MagicMock()
    tool.manifest = _make_tool("slow").manifest

    async def _hang(_params: dict) -> ToolResult:
        await asyncio.sleep(60)
        return ToolResult(tool="slow", success=True, output="")  # pragma: no cover

    tool.execute = _hang
    tool.is_auto_approved.return_value = True

    reg = _make_registry(tool)
    config = SandboxConfig(timeout_s=0.05)
    svc = SandboxService(reg, config)

    result = await svc.execute("slow", {"x": "v"})

    assert "timeout" in (result.tool_result.error or "").lower()


# ---------------------------------------------------------------------------
# Audit record
# ---------------------------------------------------------------------------


async def test_audit_record_has_tool_name() -> None:
    tool = _make_tool("my_tool")
    svc = SandboxService(_make_registry(tool))
    result = await svc.execute("my_tool", {"x": "v"})
    assert result.audit_record.tool_name == "my_tool"


async def test_audit_record_duration_positive() -> None:
    tool = _make_tool("dummy")
    svc = SandboxService(_make_registry(tool))
    result = await svc.execute("dummy", {"x": "v"})
    assert result.audit_record.duration_ms >= 0


async def test_audit_record_run_id_propagated() -> None:
    tool = _make_tool("dummy")
    svc = SandboxService(_make_registry(tool))
    result = await svc.execute("dummy", {"x": "v"}, run_id="run-99")
    assert result.audit_record.run_id == "run-99"


async def test_audit_record_workspace_id_propagated() -> None:
    tool = _make_tool("dummy")
    svc = SandboxService(_make_registry(tool))
    result = await svc.execute("dummy", {"x": "v"}, workspace_id="ws-7")
    assert result.audit_record.workspace_id == "ws-7"


async def test_audit_record_token_prefix_is_redacted() -> None:
    """Audit record stores only the first 16 chars of the token."""
    tool = _make_tool("dummy")
    svc = SandboxService(_make_registry(tool))
    result = await svc.execute("dummy", {"x": "v"})
    prefix = result.audit_record.capability_token_prefix
    assert len(prefix) <= 17  # 16 chars + possible "…"
    assert result.capability_token.startswith(prefix.rstrip("…"))


# ---------------------------------------------------------------------------
# Egress policy
# ---------------------------------------------------------------------------


async def test_shell_exec_egress_decision_not_allowed() -> None:
    """shell_exec has network_policy=none so egress must always be blocked."""
    from kairos_cognition.tools.registry import build_default_registry

    reg = build_default_registry()
    svc = SandboxService(reg)

    result = await svc.execute("shell_exec", {"command": "echo hi"})

    assert result.egress_decision.allowed is False
    assert result.egress_decision.policy == NetworkPolicy.NONE


async def test_exit_code_propagated_from_tool_metadata() -> None:
    tool = _make_tool("dummy", exit_code=0)
    svc = SandboxService(_make_registry(tool))
    result = await svc.execute("dummy", {"x": "v"})
    assert result.exit_code == 0


async def test_failed_tool_exit_code_propagated() -> None:
    tool = _make_tool("dummy", success=False, exit_code=1)
    svc = SandboxService(_make_registry(tool))
    result = await svc.execute("dummy", {"x": "v"})
    assert result.exit_code == 1
