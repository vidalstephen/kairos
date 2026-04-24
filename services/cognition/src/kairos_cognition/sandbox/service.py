"""SandboxService — per-call sandbox execution wrapper — Phase 1.10.

Every tool call is routed through :class:`SandboxService` instead of being
dispatched directly to the tool.  The service:

1. Mints a per-call HMAC capability token (``KAIROS_CAP_TOKEN``).
2. Checks the tool's egress policy before execution.
3. For ``shell_exec``: creates a sandboxed tool instance that passes the
   capability token as an environment variable and applies OS resource
   limits via ``preexec_fn``.
4. Enforces an overall wall-clock timeout; times out → SIGKILL → exit 137.
5. Emits a structured :class:`AuditRecord` for every execution.

Phase 5 will replace step 3 with a Docker executor container spawned on
the ``kairos-sandbox`` Docker network.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import structlog

from kairos_cognition.sandbox.capability_token import mint_token
from kairos_cognition.sandbox.egress_policy import EgressDecision, EgressPolicy, NetworkPolicy
from kairos_cognition.sandbox.resource_limits import ResourceLimitConfig, get_preexec_fn
from kairos_cognition.tools.base import ToolResult

if TYPE_CHECKING:
    from kairos_cognition.tools.registry import ToolRegistry

logger = structlog.get_logger(__name__)

# Exit code returned when the sandbox kills a timed-out executor (SIGKILL).
EXIT_KILLED_BY_TIMEOUT: int = 137


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


@dataclass
class SandboxConfig:
    """Configuration for :class:`SandboxService`."""

    timeout_s: float = 30.0
    """Overall wall-clock timeout for a single tool execution."""

    resource_limits: ResourceLimitConfig = field(default_factory=ResourceLimitConfig)
    """Resource limits applied to subprocess-based tools (shell_exec)."""

    network_name: str = "kairos-sandbox"
    """Docker network name for Phase 5+ executor containers."""


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass
class AuditRecord:
    """Structured audit event emitted for every sandbox execution.

    Stored in the audit log so that every tool call is fully traceable.
    The ``capability_token`` field carries only the first 16 characters of
    the token for readability — the full token is never logged.
    """

    tool_name: str
    run_id: str
    workspace_id: str
    capability_token_prefix: str
    """First 16 characters of the capability token (not the full value)."""
    egress_policy: str
    egress_blocked: bool
    exit_code: int | None
    killed_by_timeout: bool
    duration_ms: float
    success: bool


@dataclass
class SandboxExecResult:
    """Result of a sandboxed tool execution."""

    tool_result: ToolResult
    """The underlying tool result (output, success, error, metadata)."""

    capability_token: str
    """The full capability token minted for this call."""

    exit_code: int | None
    """Process exit code, or ``None`` for non-subprocess tools."""

    killed_by_timeout: bool
    """``True`` if the executor was killed due to wall-clock timeout."""

    egress_decision: EgressDecision
    """Egress policy decision for this call."""

    audit_record: AuditRecord
    """Structured audit record for this execution."""


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class SandboxService:
    """Wraps tool execution in a per-call sandbox context.

    Usage::

        sandbox = SandboxService(registry)
        result = await sandbox.execute("shell_exec", {"command": "ls /tmp"})
    """

    def __init__(
        self,
        registry: ToolRegistry,
        config: SandboxConfig | None = None,
    ) -> None:
        self._registry = registry
        self._config = config or SandboxConfig()

    async def execute(
        self,
        tool_name: str,
        params: dict[str, Any],
        *,
        run_id: str = "",
        workspace_id: str = "",
    ) -> SandboxExecResult:
        """Execute *tool_name* with *params* inside a sandbox context.

        Args:
            tool_name:    Name of the tool to execute.
            params:       Tool parameters (validated by the registry).
            run_id:       Run identifier for capability token scoping.
            workspace_id: Workspace identifier included in the audit record.

        Returns:
            A :class:`SandboxExecResult` containing the tool output, the
            minted capability token, egress decision, and audit record.
        """
        token = mint_token(tool_name, run_id)
        start = time.monotonic()

        # ----------------------------------------------------------------
        # Unknown tool — fast-path error
        # ----------------------------------------------------------------
        tool = self._registry.get(tool_name)
        if tool is None:
            duration_ms = (time.monotonic() - start) * 1000
            tool_result = ToolResult(
                tool=tool_name,
                success=False,
                output="",
                error=f"tool {tool_name!r} not found in registry",
            )
            egress_decision = EgressDecision(
                allowed=False,
                policy=NetworkPolicy.NONE,
                reason="tool not found",
            )
            audit = _build_audit(
                tool_name,
                run_id,
                workspace_id,
                token,
                egress_policy="none",
                egress_blocked=False,
                exit_code=None,
                killed=False,
                duration_ms=duration_ms,
                success=False,
            )
            return SandboxExecResult(
                tool_result=tool_result,
                capability_token=token,
                exit_code=None,
                killed_by_timeout=False,
                egress_decision=egress_decision,
                audit_record=audit,
            )

        # ----------------------------------------------------------------
        # Egress policy check
        # ----------------------------------------------------------------
        egress_policy = EgressPolicy.from_manifest(tool.manifest)
        egress_decision = egress_policy.check()

        # ----------------------------------------------------------------
        # For shell_exec: inject capability token env var + resource limits
        # ----------------------------------------------------------------
        if tool_name == "shell_exec":
            from kairos_cognition.tools.shell_exec import ShellExecTool

            tool = ShellExecTool(
                sandbox_env={"KAIROS_CAP_TOKEN": token},
                preexec_fn=get_preexec_fn(self._config.resource_limits),
            )

        # ----------------------------------------------------------------
        # Execute with wall-clock timeout
        # ----------------------------------------------------------------
        killed_by_timeout = False
        exit_code: int | None = None

        try:
            tool_result = await asyncio.wait_for(
                tool.execute(params),
                timeout=self._config.timeout_s,
            )
            exit_code = tool_result.metadata.get("exit_code")
        except TimeoutError:
            killed_by_timeout = True
            exit_code = EXIT_KILLED_BY_TIMEOUT
            tool_result = ToolResult(
                tool=tool_name,
                success=False,
                output="",
                error=f"sandbox timeout after {self._config.timeout_s:.1f}s",
                metadata={"exit_code": EXIT_KILLED_BY_TIMEOUT},
            )

        duration_ms = (time.monotonic() - start) * 1000

        audit = _build_audit(
            tool_name,
            run_id,
            workspace_id,
            token,
            egress_policy=egress_policy.policy.value,
            egress_blocked=not egress_decision.allowed,
            exit_code=exit_code,
            killed=killed_by_timeout,
            duration_ms=duration_ms,
            success=tool_result.success,
        )

        logger.info(
            "sandbox.exec",
            tool=tool_name,
            run_id=run_id,
            killed_by_timeout=killed_by_timeout,
            exit_code=exit_code,
            duration_ms=round(duration_ms, 1),
            success=tool_result.success,
        )

        return SandboxExecResult(
            tool_result=tool_result,
            capability_token=token,
            exit_code=exit_code,
            killed_by_timeout=killed_by_timeout,
            egress_decision=egress_decision,
            audit_record=audit,
        )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _build_audit(
    tool_name: str,
    run_id: str,
    workspace_id: str,
    token: str,
    *,
    egress_policy: str,
    egress_blocked: bool,
    exit_code: int | None,
    killed: bool,
    duration_ms: float,
    success: bool,
) -> AuditRecord:
    return AuditRecord(
        tool_name=tool_name,
        run_id=run_id,
        workspace_id=workspace_id,
        capability_token_prefix=token[:16],
        egress_policy=egress_policy,
        egress_blocked=egress_blocked,
        exit_code=exit_code,
        killed_by_timeout=killed,
        duration_ms=round(duration_ms, 1),
        success=success,
    )
