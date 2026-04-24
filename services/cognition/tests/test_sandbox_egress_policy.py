"""Tests for sandbox/egress_policy.py."""

from __future__ import annotations

from kairos_cognition.sandbox.egress_policy import (
    EgressDecision,
    EgressPolicy,
    NetworkPolicy,
)
from kairos_cognition.tools.base import ToolManifest, ToolParam


def _manifest(network_policy: str) -> ToolManifest:
    return ToolManifest(
        name="test_tool",
        version="1.0.0",
        description="test",
        params={"cmd": ToolParam(type="string", description="", required=True)},
        capabilities=(),
        network_policy=network_policy,
    )


# ---------------------------------------------------------------------------
# from_manifest
# ---------------------------------------------------------------------------


def test_from_manifest_none_policy() -> None:
    policy = EgressPolicy.from_manifest(_manifest("none"))
    assert policy.policy == NetworkPolicy.NONE


def test_from_manifest_allowlist_policy() -> None:
    policy = EgressPolicy.from_manifest(_manifest("allowlist"))
    assert policy.policy == NetworkPolicy.ALLOWLIST


def test_from_manifest_unknown_defaults_to_none() -> None:
    policy = EgressPolicy.from_manifest(_manifest("garbage"))
    assert policy.policy == NetworkPolicy.NONE


def test_from_manifest_case_insensitive() -> None:
    policy = EgressPolicy.from_manifest(_manifest("NONE"))
    assert policy.policy == NetworkPolicy.NONE


def test_shell_exec_manifest_has_none_policy() -> None:
    from kairos_cognition.tools.shell_exec import ShellExecTool

    tool = ShellExecTool()
    policy = EgressPolicy.from_manifest(tool.manifest)
    assert policy.policy == NetworkPolicy.NONE


# ---------------------------------------------------------------------------
# none policy
# ---------------------------------------------------------------------------


def test_none_policy_blocks_domain() -> None:
    policy = EgressPolicy(policy=NetworkPolicy.NONE)
    decision = policy.check(domain="example.com")
    assert decision.allowed is False


def test_none_policy_blocks_no_domain() -> None:
    policy = EgressPolicy(policy=NetworkPolicy.NONE)
    decision = policy.check(domain=None)
    assert decision.allowed is False


def test_none_policy_decision_has_correct_policy() -> None:
    policy = EgressPolicy(policy=NetworkPolicy.NONE)
    decision = policy.check()
    assert decision.policy == NetworkPolicy.NONE


def test_none_policy_reason_mentions_blocked() -> None:
    policy = EgressPolicy(policy=NetworkPolicy.NONE)
    decision = policy.check()
    assert "blocked" in decision.reason.lower()


# ---------------------------------------------------------------------------
# allowlist policy
# ---------------------------------------------------------------------------


def test_allowlist_allows_listed_domain() -> None:
    policy = EgressPolicy(policy=NetworkPolicy.ALLOWLIST, allowed_domains=["api.openai.com"])
    decision = policy.check(domain="api.openai.com")
    assert decision.allowed is True


def test_allowlist_blocks_unlisted_domain() -> None:
    policy = EgressPolicy(policy=NetworkPolicy.ALLOWLIST, allowed_domains=["api.openai.com"])
    decision = policy.check(domain="evil.example.com")
    assert decision.allowed is False


def test_allowlist_blocks_none_domain() -> None:
    policy = EgressPolicy(policy=NetworkPolicy.ALLOWLIST, allowed_domains=["api.openai.com"])
    decision = policy.check(domain=None)
    assert decision.allowed is False


def test_allowlist_reason_mentions_not_in_allowlist() -> None:
    policy = EgressPolicy(policy=NetworkPolicy.ALLOWLIST, allowed_domains=[])
    decision = policy.check(domain="evil.com")
    assert "allowlist" in decision.reason.lower() or "not in" in decision.reason.lower()


def test_egress_decision_dataclass_fields() -> None:
    d = EgressDecision(allowed=True, policy=NetworkPolicy.ALLOWLIST, domain="x.com", reason="ok")
    assert d.allowed is True
    assert d.domain == "x.com"
