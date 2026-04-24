"""Kairos sandbox module — Phase 1.10.

Wraps every tool call in a sandboxed execution context that provides:
- Per-call HMAC-signed capability tokens (``KAIROS_CAP_TOKEN`` env var)
- Egress policy enforcement derived from ``ToolManifest.network_policy``
- Resource limits applied via ``preexec_fn`` (shell_exec subprocess only)
- Wall-clock timeout with SIGKILL → exit 137
- Structured audit records for every execution

Phase 5 will replace the Python-level subprocess sandbox with a Docker
executor container attached to the ``kairos-sandbox`` Docker network.
"""

from __future__ import annotations

from kairos_cognition.sandbox.capability_token import (
    clear_used_tokens,
    mint_token,
    verify_token,
)
from kairos_cognition.sandbox.egress_policy import (
    EgressDecision,
    EgressPolicy,
    NetworkPolicy,
)
from kairos_cognition.sandbox.resource_limits import (
    DEFAULT_LIMITS,
    ResourceLimitConfig,
    get_preexec_fn,
)
from kairos_cognition.sandbox.service import (
    EXIT_KILLED_BY_TIMEOUT,
    AuditRecord,
    SandboxConfig,
    SandboxExecResult,
    SandboxService,
)

__all__ = [
    "DEFAULT_LIMITS",
    "EXIT_KILLED_BY_TIMEOUT",
    "AuditRecord",
    "EgressDecision",
    "EgressPolicy",
    # egress_policy
    "NetworkPolicy",
    # resource_limits
    "ResourceLimitConfig",
    # service
    "SandboxConfig",
    "SandboxExecResult",
    "SandboxService",
    "clear_used_tokens",
    "get_preexec_fn",
    # capability_token
    "mint_token",
    "verify_token",
]
