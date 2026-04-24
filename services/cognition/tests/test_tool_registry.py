"""Tests for tools/registry.py."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

from kairos_cognition.tools.base import ToolManifest, ToolParam, ToolResult
from kairos_cognition.tools.registry import (
    ToolRegistry,
    build_default_registry,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_tool(
    name: str = "dummy",
    params: dict[str, ToolParam] | None = None,
    auto_approved: bool = False,
) -> MagicMock:
    tool = MagicMock()
    tool.manifest = ToolManifest(
        name=name,
        version="0.0.1",
        description="test tool",
        params=params
        or {
            "arg": ToolParam(type="string", description="", required=True),
        },
        capabilities=(),
    )
    tool.is_auto_approved.return_value = auto_approved
    tool.execute = AsyncMock(return_value=ToolResult(tool=name, success=True, output="ok"))
    return tool


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


def test_register_and_get() -> None:
    reg = ToolRegistry()
    tool = _make_tool("alpha")
    reg.register(tool)
    assert reg.get("alpha") is tool


def test_get_missing_returns_none() -> None:
    reg = ToolRegistry()
    assert reg.get("nonexistent") is None


def test_list_names_sorted() -> None:
    reg = ToolRegistry()
    for name in ("zebra", "apple", "mango"):
        reg.register(_make_tool(name))
    assert reg.list_names() == ["apple", "mango", "zebra"]


def test_list_manifests_sorted_by_name() -> None:
    reg = ToolRegistry()
    for name in ("z_tool", "a_tool"):
        reg.register(_make_tool(name))
    names = [m.name for m in reg.list_manifests()]
    assert names == ["a_tool", "z_tool"]


# ---------------------------------------------------------------------------
# Param validation
# ---------------------------------------------------------------------------


def test_validate_params_valid() -> None:
    reg = ToolRegistry()
    reg.register(_make_tool("t", params={"msg": ToolParam(type="string", required=True)}))
    result = reg.validate_params("t", {"msg": "hello"})
    assert result.valid
    assert result.errors == []


def test_validate_params_missing_required() -> None:
    reg = ToolRegistry()
    reg.register(_make_tool("t", params={"req": ToolParam(type="string", required=True)}))
    result = reg.validate_params("t", {})
    assert not result.valid
    assert any(e.field == "req" for e in result.errors)


def test_validate_params_wrong_type() -> None:
    reg = ToolRegistry()
    reg.register(_make_tool("t", params={"count": ToolParam(type="number", required=True)}))
    result = reg.validate_params("t", {"count": "not-a-number"})
    assert not result.valid
    assert any("number" in e.message for e in result.errors)


def test_validate_params_optional_absent_ok() -> None:
    reg = ToolRegistry()
    reg.register(
        _make_tool(
            "t",
            params={
                "req": ToolParam(type="string", required=True),
                "opt": ToolParam(type="string", required=False),
            },
        )
    )
    result = reg.validate_params("t", {"req": "yes"})
    assert result.valid


def test_validate_params_unknown_tool() -> None:
    reg = ToolRegistry()
    result = reg.validate_params("no_such_tool", {})
    assert not result.valid
    assert any("unknown tool" in e.message for e in result.errors)


# ---------------------------------------------------------------------------
# Auto-approve delegation
# ---------------------------------------------------------------------------


def test_is_auto_approved_delegates_to_tool() -> None:
    reg = ToolRegistry()
    reg.register(_make_tool("safe", auto_approved=True))
    assert reg.is_auto_approved("safe", {}) is True


def test_is_auto_approved_false_for_unknown_tool() -> None:
    reg = ToolRegistry()
    assert reg.is_auto_approved("ghost", {}) is False


# ---------------------------------------------------------------------------
# Default registry
# ---------------------------------------------------------------------------


def test_build_default_registry_has_all_tools() -> None:
    reg = build_default_registry()
    expected = {
        "shell_exec",
        "file_read",
        "file_write",
        "file_list",
        "memory_recall",
        "memory_store",
    }
    assert set(reg.list_names()) == expected
