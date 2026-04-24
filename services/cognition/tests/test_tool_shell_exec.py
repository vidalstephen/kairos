"""Tests for tools/shell_exec.py."""

from __future__ import annotations

import sys

import pytest

from kairos_cognition.tools.shell_exec import _MAX_OUTPUT_CHARS, _MAX_TIMEOUT_MS, ShellExecTool


@pytest.fixture()
def tool() -> ShellExecTool:
    return ShellExecTool()


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------


def test_manifest_name(tool: ShellExecTool) -> None:
    assert tool.manifest.name == "shell_exec"


# ---------------------------------------------------------------------------
# Auto-approve (read-only detection)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "command",
    [
        "ls -la /tmp",
        "cat /etc/hostname",
        "grep -r foo .",
        "find / -name '*.py'",
        "echo hello",
        "pwd",
        "which python3",
        "whoami",
        "head -5 README.md",
        "tail -10 /var/log/syslog",
        "wc -l file.txt",
        "diff a.txt b.txt",
        "stat /etc",
    ],
)
def test_is_auto_approved_read_only(tool: ShellExecTool, command: str) -> None:
    assert tool.is_auto_approved({"command": command}) is True


@pytest.mark.parametrize(
    "command",
    [
        "rm -rf /tmp/x",
        "mv a b",
        "cp src dst",
        "chmod 777 file",
        "chown root:root file",
        "pip install requests",
        "apt-get install curl",
        "curl https://example.com",
        "wget https://example.com",
        "sudo ls",
    ],
)
def test_is_not_auto_approved_write_or_network(tool: ShellExecTool, command: str) -> None:
    assert tool.is_auto_approved({"command": command}) is False


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------


async def test_execute_echo_success(tool: ShellExecTool) -> None:
    result = await tool.execute({"command": "echo hello"})
    assert result.success
    assert "hello" in result.output
    assert result.error is None
    assert result.metadata["exit_code"] == 0


async def test_execute_exit_nonzero(tool: ShellExecTool) -> None:
    result = await tool.execute({"command": "exit 1", "timeout_ms": 2000})
    assert not result.success
    assert result.metadata["exit_code"] != 0


async def test_execute_command_not_found(tool: ShellExecTool) -> None:
    result = await tool.execute({"command": "nonexistentcmd_kairos_test_xyz"})
    # Either OSError path or shell returns non-zero — both are success=False
    assert not result.success


async def test_execute_timeout(tool: ShellExecTool) -> None:
    result = await tool.execute({"command": "sleep 10", "timeout_ms": 100})
    assert not result.success
    assert "timed out" in (result.error or "")


async def test_execute_output_truncated(tool: ShellExecTool) -> None:
    # Generate output larger than _MAX_OUTPUT_CHARS
    chars = _MAX_OUTPUT_CHARS + 500
    cmd = f"{sys.executable} -c \"print('x' * {chars})\""
    result = await tool.execute({"command": cmd})
    assert result.truncated
    assert "[truncated]" in result.output


async def test_execute_timeout_capped_at_max(tool: ShellExecTool) -> None:
    """Passing a timeout > _MAX_TIMEOUT_MS should not raise — cap is applied."""
    # We don't actually wait the full time; just verify no exception with huge timeout.
    result = await tool.execute({"command": "echo ok", "timeout_ms": _MAX_TIMEOUT_MS * 10})
    assert result.success
