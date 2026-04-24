"""Egress policy for sandboxed tool execution — Phase 1.10.

Derives a network access policy from a tool manifest and checks whether a
target domain is permitted before the tool is dispatched.

Phase 1 policies:

- ``none``      — no network access allowed for this tool call.
- ``allowlist`` — only domains listed in ``allowed_domains`` are permitted.

Phase 2 will add an in-sandbox HTTP proxy that enforces the allowlist at the
kernel / iptables level so that a misbehaving tool cannot bypass the policy by
opening raw sockets.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from kairos_cognition.tools.base import ToolManifest


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class NetworkPolicy(StrEnum):
    """Network access policies stored in ``ToolManifest.network_policy``."""

    NONE = "none"
    """All egress is blocked for this tool call."""

    ALLOWLIST = "allowlist"
    """Egress is permitted only to pre-approved domains."""


# ---------------------------------------------------------------------------
# Decision type
# ---------------------------------------------------------------------------


@dataclass
class EgressDecision:
    """Result of an egress policy check."""

    allowed: bool
    """Whether the egress request is permitted."""

    policy: NetworkPolicy
    """Policy that produced this decision."""

    domain: str | None = None
    """Domain that was checked (``None`` if not applicable)."""

    reason: str = ""
    """Human-readable explanation of the decision."""


# ---------------------------------------------------------------------------
# Policy
# ---------------------------------------------------------------------------


@dataclass
class EgressPolicy:
    """Egress policy for a single tool call, derived from ``ToolManifest``."""

    policy: NetworkPolicy
    allowed_domains: list[str] = field(default_factory=list)

    # ------------------------------------------------------------------
    # Factory
    # ------------------------------------------------------------------

    @classmethod
    def from_manifest(cls, manifest: ToolManifest) -> EgressPolicy:
        """Build an :class:`EgressPolicy` from a :class:`ToolManifest`.

        An unknown ``network_policy`` string defaults to :attr:`NetworkPolicy.NONE`
        for fail-safe behaviour.
        """
        policy_str = manifest.network_policy.lower()
        try:
            policy = NetworkPolicy(policy_str)
        except ValueError:
            policy = NetworkPolicy.NONE
        return cls(policy=policy)

    # ------------------------------------------------------------------
    # Check
    # ------------------------------------------------------------------

    def check(self, domain: str | None = None) -> EgressDecision:
        """Check whether *domain* is permitted under this policy.

        Args:
            domain: The target domain (hostname or IP).  Pass ``None``
                    when no specific domain is known — the call will be
                    blocked under all non-``none`` policies.

        Returns:
            An :class:`EgressDecision` indicating whether the call is
            allowed and the reason.
        """
        if self.policy == NetworkPolicy.NONE:
            return EgressDecision(
                allowed=False,
                policy=self.policy,
                domain=domain,
                reason="network_policy=none: all egress blocked",
            )

        # ALLOWLIST policy
        if domain is None:
            return EgressDecision(
                allowed=False,
                policy=self.policy,
                domain=None,
                reason="domain is required for allowlist policy",
            )
        if domain in self.allowed_domains:
            return EgressDecision(
                allowed=True,
                policy=self.policy,
                domain=domain,
                reason="domain is allowlisted",
            )
        return EgressDecision(
            allowed=False,
            policy=self.policy,
            domain=domain,
            reason=f"domain {domain!r} is not in the allowlist",
        )
