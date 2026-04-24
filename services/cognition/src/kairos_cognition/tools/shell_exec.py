"""shell_exec tool — Phase 1.9.

Executes a shell command asynchronously using ``asyncio.create_subprocess_shell``.

Read-only commands (ls, cat, grep, find, …) are auto-approved.  All other
commands require the approval workflow (enforced at the caller level by
checking :meth:`ShellExecTool.is_auto_approved`).

Phase 1 note: the command runs in the host process environment.  Phase 1.10
will wrap execution in the sandboxed executor container.
"""

from __future__ import annotations

import asyncio
import os
import re
from typing import TYPE_CHECKING, Any

from kairos_cognition.tools.base import ToolManifest, ToolParam, ToolResult

if TYPE_CHECKING:
    from collections.abc import Callable

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_DEFAULT_TIMEOUT_MS: int = 5_000
_MAX_TIMEOUT_MS: int = 30_000
_MAX_OUTPUT_CHARS: int = 8_000

# Read-only command prefixes — these auto-approve without the approval workflow.
# Patterns match the first token of the command (after stripping leading space).
_READ_ONLY_RE: list[re.Pattern] = [
    re.compile(r"^\s*ls(\s|$)"),
    re.compile(r"^\s*ll(\s|$)"),
    re.compile(r"^\s*la(\s|$)"),
    re.compile(r"^\s*dir(\s|$)"),
    re.compile(r"^\s*cat(\s|$)"),
    re.compile(r"^\s*grep(\s|$)"),
    re.compile(r"^\s*find(\s|$)"),
    re.compile(r"^\s*echo(\s|$)"),
    re.compile(r"^\s*pwd(\s|$)"),
    re.compile(r"^\s*which(\s|$)"),
    re.compile(r"^\s*whoami(\s|$)"),
    re.compile(r"^\s*env(\s|$)"),
    re.compile(r"^\s*head(\s|$)"),
    re.compile(r"^\s*tail(\s|$)"),
    re.compile(r"^\s*wc(\s|$)"),
    re.compile(r"^\s*diff(\s|$)"),
    re.compile(r"^\s*stat(\s|$)"),
    re.compile(r"^\s*file(\s|$)"),
    re.compile(r"^\s*type(\s|$)"),
    re.compile(r"^\s*uname(\s|$)"),
    re.compile(r"^\s*date(\s|$)"),
    re.compile(r"^\s*uptime(\s|$)"),
    re.compile(r"^\s*df(\s|$)"),
    re.compile(r"^\s*du(\s|$)"),
    re.compile(r"^\s*ps(\s|$)"),
]

_MANIFEST = ToolManifest(
    name="shell_exec",
    version="1.0.0",
    description="Execute a shell command in the sandboxed executor",
    params={
        "command": ToolParam(type="string", description="Shell command to run", required=True),
        "timeout_ms": ToolParam(
            type="number",
            description=f"Timeout in milliseconds (max {_MAX_TIMEOUT_MS})",
            required=False,
        ),
    },
    capabilities=("shell",),
    network_policy="none",
    blast_radius="write_local",
)


# ---------------------------------------------------------------------------
# Tool implementation
# ---------------------------------------------------------------------------


class ShellExecTool:
    """Async shell execution with read-only auto-approve detection.

    Args:
        sandbox_env: Optional extra environment variables injected by
            :class:`~kairos_cognition.sandbox.service.SandboxService`.
            The ``KAIROS_CAP_TOKEN`` capability token is passed here.
        preexec_fn: Optional callable applied in the child process before
            ``exec``.  Used by the sandbox to apply OS resource limits.
    """

    def __init__(
        self,
        *,
        sandbox_env: dict[str, str] | None = None,
        preexec_fn: Callable[[], None] | None = None,
    ) -> None:
        self._sandbox_env: dict[str, str] = sandbox_env or {}
        self._preexec_fn = preexec_fn

    @property
    def manifest(self) -> ToolManifest:
        return _MANIFEST

    def is_auto_approved(self, params: dict[str, Any]) -> bool:
        """Return ``True`` if *command* matches a known read-only pattern."""
        command: str = params.get("command", "")
        return any(pat.match(command) for pat in _READ_ONLY_RE)

    async def execute(self, params: dict[str, Any]) -> ToolResult:
        command: str = params["command"]
        timeout_ms = int(params.get("timeout_ms", _DEFAULT_TIMEOUT_MS))
        timeout_ms = min(timeout_ms, _MAX_TIMEOUT_MS)
        timeout_s = timeout_ms / 1000.0

        # Build subprocess environment: inherit host env, layer sandbox extras.
        env: dict[str, str] | None = None
        if self._sandbox_env:
            env = {**os.environ, **self._sandbox_env}

        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
                preexec_fn=self._preexec_fn,
            )
            try:
                stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
            except TimeoutError:
                proc.kill()
                await proc.communicate()
                return ToolResult(
                    tool="shell_exec",
                    success=False,
                    output="",
                    error=f"command timed out after {timeout_ms}ms",
                )
        except OSError as exc:
            return ToolResult(
                tool="shell_exec",
                success=False,
                output="",
                error=str(exc),
            )

        stdout = stdout_b.decode(errors="replace")
        stderr = stderr_b.decode(errors="replace")
        combined = stdout + (f"\n[stderr]\n{stderr}" if stderr else "")

        truncated = len(combined) > _MAX_OUTPUT_CHARS
        if truncated:
            combined = combined[:_MAX_OUTPUT_CHARS] + "\n… [truncated]"

        rc = proc.returncode
        success = rc == 0

        return ToolResult(
            tool="shell_exec",
            success=success,
            output=combined,
            error=None if success else f"exit code {rc}",
            truncated=truncated,
            metadata={"exit_code": rc},
        )
